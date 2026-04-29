import { createClient } from '@supabase/supabase-js';
import { normalizeConversationProvider, type ConversationProvider } from './callProvider.js';
import { env } from './config.js';
import { logger } from './logger.js';
import {
  extractConfirmedMenuItems,
  extractCustomerName,
  extractFinalReadbackSection,
  extractTotalCentsFromAssistantTranscript,
  inferNameFromMessages,
  parseElevenLabsDcItems
} from './orderExtraction.js';
import { sendCustomerOrderSms, sendRestaurantOrderSms } from './sms.js';

export const supabase = createClient(
  env.SUPABASE_URL || 'https://placeholder.supabase.co',
  env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key',
  { auth: { persistSession: false } }
);

const silenceTimers = new Map<string, NodeJS.Timeout>();

export type CallStatus = 'ringing' | 'in_progress' | 'completed' | 'failed';

export async function upsertCall(params: {
  twilioCallSid: string;
  provider?: ConversationProvider;
  fromNumber?: string;
  toNumber?: string;
  status: CallStatus;
  startedAt?: string;
  endedAt?: string;
}) {
  const { data: existing } = await supabase
    .from('calls')
    .select('from_number,to_number,started_at,ended_at,provider')
    .eq('twilio_call_sid', params.twilioCallSid)
    .maybeSingle();

  const payload = {
    twilio_call_sid: params.twilioCallSid,
    provider: normalizeConversationProvider(params.provider ?? existing?.provider),
    from_number: params.fromNumber ?? existing?.from_number ?? null,
    to_number: params.toNumber ?? existing?.to_number ?? null,
    status: params.status,
    started_at: params.startedAt ?? existing?.started_at ?? null,
    ended_at: params.endedAt ?? existing?.ended_at ?? null
  };

  const { error } = await supabase.from('calls').upsert(payload, {
    onConflict: 'twilio_call_sid'
  });

  if (error) throw error;
}

export async function insertMessage(params: {
  twilioCallSid: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  confidence?: number;
}) {
  logger.info(
    {
      callSid: params.twilioCallSid,
      role: params.role,
      textLength: params.text.length
    },
    'insertMessage called'
  );

  let { data: callRow, error: callError } = await supabase
    .from('calls')
    .select('id')
    .eq('twilio_call_sid', params.twilioCallSid)
    .maybeSingle();

  if (!callRow) {
    logger.warn({ callSid: params.twilioCallSid }, 'Call row missing while inserting transcript, creating fallback row');
    await upsertCall({
      twilioCallSid: params.twilioCallSid,
      status: 'in_progress'
    });
    const retry = await supabase
      .from('calls')
      .select('id')
      .eq('twilio_call_sid', params.twilioCallSid)
      .maybeSingle();
    callRow = retry.data ?? null;
    callError = retry.error;
  }

  if (callError || !callRow) throw callError ?? new Error('Call row not found');

  const { error } = await supabase.from('call_messages').insert({
    call_id: callRow.id,
    role: params.role,
    text: params.text,
    confidence: params.confidence ?? null
  });

  if (error) throw error;
  logger.info(
    {
      callSid: params.twilioCallSid,
      callId: callRow.id,
      role: params.role
    },
    'insertMessage succeeded'
  );
}

export async function replaceMessages(params: {
  twilioCallSid: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; text: string; createdAt?: string }>;
}) {
  let { data: callRow, error: callError } = await supabase
    .from('calls')
    .select('id')
    .eq('twilio_call_sid', params.twilioCallSid)
    .maybeSingle();

  if (!callRow) {
    await upsertCall({
      twilioCallSid: params.twilioCallSid,
      status: 'in_progress'
    });
    const retry = await supabase
      .from('calls')
      .select('id')
      .eq('twilio_call_sid', params.twilioCallSid)
      .maybeSingle();
    callRow = retry.data ?? null;
    callError = retry.error;
  }

  if (callError || !callRow) throw callError ?? new Error('Call row not found');

  const { error: deleteError } = await supabase.from('call_messages').delete().eq('call_id', callRow.id);
  if (deleteError) throw deleteError;

  if (params.messages.length === 0) return;

  const { error: insertError } = await supabase.from('call_messages').insert(
    params.messages.map((message) => ({
      call_id: callRow.id,
      role: message.role,
      text: message.text,
      confidence: null,
      created_at: message.createdAt ?? undefined
    }))
  );
  if (insertError) throw insertError;
}

function clearSilenceTimer(twilioCallSid: string) {
  const timer = silenceTimers.get(twilioCallSid);
  if (timer) {
    clearTimeout(timer);
    silenceTimers.delete(twilioCallSid);
  }
}

export function notifyUserActivity(twilioCallSid: string) {
  clearSilenceTimer(twilioCallSid);
  const timer = setTimeout(() => {
    void closeCall({ twilioCallSid, reason: 'no_response', summary: 'Call ended due to silence.' });
  }, 15_000);
  silenceTimers.set(twilioCallSid, timer);
}

export async function closeCall(params: { twilioCallSid: string; reason: string; summary?: string }) {
  clearSilenceTimer(params.twilioCallSid);
  const { data: callRow } = await supabase
    .from('calls')
    .select('id,status')
    .eq('twilio_call_sid', params.twilioCallSid)
    .maybeSingle();
  if (!callRow || callRow.status === 'completed') return;
  const updates: Record<string, unknown> = { status: 'completed' };
  if (params.summary) updates.summary = params.summary;
  await supabase.from('calls').update(updates).eq('twilio_call_sid', params.twilioCallSid);
  if (callRow.id) {
    await supabase.from('call_events').insert({
      call_id: callRow.id,
      event_type: 'call.close',
      payload: {
        reason: params.reason,
        closing_message: params.summary ?? 'Call completed.'
      }
    });
  }
}

export async function insertEvent(params: {
  twilioCallSid: string;
  provider?: ConversationProvider;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  let { data: callRow, error: callError } = await supabase
    .from('calls')
    .select('id')
    .eq('twilio_call_sid', params.twilioCallSid)
    .maybeSingle();

  if (!callRow) {
    logger.warn(
      { callSid: params.twilioCallSid, eventType: params.eventType },
      'Call row missing while inserting event, creating fallback row'
    );
    await upsertCall({
      twilioCallSid: params.twilioCallSid,
      status: 'in_progress'
    });
    const retry = await supabase
      .from('calls')
      .select('id')
      .eq('twilio_call_sid', params.twilioCallSid)
      .maybeSingle();
    callRow = retry.data ?? null;
    callError = retry.error;
  }

  if (callError || !callRow) return;

  await supabase.from('call_events').insert({
    call_id: callRow.id,
    event_type: params.eventType,
    payload: {
      provider: normalizeConversationProvider(params.provider),
      ...params.payload
    }
  });
  logger.debug(
    { callSid: params.twilioCallSid, callId: callRow.id, eventType: params.eventType },
    'insertEvent succeeded'
  );
}

export async function createOrder(params: {
  callerPhone?: string;
  customerName: string;
  pickupTime: string;
  notes?: string;
  totalCents?: number;
  isAdvanceOrder?: boolean;
  advancePickupDate?: string;
  advancePickupTime?: string;
  items: Array<{
    menuItemId?: string;
    customName?: string;
    qty: number;
    modifierJson?: unknown[];
    lineTotalCents?: number;
  }>;
}) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      caller_phone: params.callerPhone ?? null,
      customer_name: params.customerName,
      pickup_time: params.pickupTime,
      notes: params.notes ?? null,
      total_cents: params.totalCents ?? 0,
      status: 'new',
      is_advance_order: params.isAdvanceOrder ?? false,
      advance_pickup_date: params.advancePickupDate ?? null,
      advance_pickup_time: params.advancePickupTime ?? null
    })
    .select('id')
    .single();

  if (orderError || !order) throw orderError ?? new Error('Unable to create order');

  if (params.items.length > 0) {
    const { error: itemError } = await supabase.from('order_items').insert(
      params.items.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menuItemId ?? null,
        custom_name: item.customName ?? null,
        qty: item.qty,
        modifier_json: item.modifierJson ?? [],
        line_total_cents: item.lineTotalCents ?? 0
      }))
    );
    if (itemError) throw itemError;
  }
}

export async function createReservation(params: {
  callerPhone?: string;
  guestName: string;
  partySize: number;
  reservationTime: string;
  notes?: string;
  status?: 'confirmed' | 'escalated';
}) {
  const { error } = await supabase.from('reservations').insert({
    caller_phone: params.callerPhone ?? null,
    guest_name: params.guestName,
    party_size: params.partySize,
    reservation_time: params.reservationTime,
    notes: params.notes ?? null,
    status: params.status ?? 'confirmed'
  });

  if (error) throw error;
}

export async function upsertStructuredOutput(params: {
  twilioCallSid: string;
  provider?: ConversationProvider;
  source: 'model_tool' | 'transcript_fallback';
  parseStatus?: 'ok' | 'failed';
  payload: StructuredCallOutcome;
}) {
  const { data: callRow, error: callError } = await supabase
    .from('calls')
    .select('id')
    .eq('twilio_call_sid', params.twilioCallSid)
    .maybeSingle();
  if (callError || !callRow) throw callError ?? new Error('Call row not found for structured output');

  const { error } = await supabase.from('call_structured_outputs').upsert(
    {
      call_id: callRow.id,
      source: params.source,
      schema_version: params.payload.schema_version,
      payload: params.payload,
      parse_status: params.parseStatus ?? 'ok',
      updated_at: new Date().toISOString()
    },
    { onConflict: 'call_id' }
  );
  if (error) throw error;
}

export async function getStructuredOutputByCallSid(twilioCallSid: string) {
  const { data: callRow } = await supabase
    .from('calls')
    .select('id')
    .eq('twilio_call_sid', twilioCallSid)
    .maybeSingle();
  if (!callRow) return null;

  const { data } = await supabase
    .from('call_structured_outputs')
    .select('payload,source,parse_status')
    .eq('call_id', callRow.id)
    .maybeSingle();
  return data ?? null;
}

export async function buildMenuGuardPrompt(): Promise<string> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('name,price_cents,active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error || !data || data.length === 0) {
    return 'Menu is unavailable right now. Ask the caller to wait for staff assistance.';
  }

  const menuLines = data.map((item) => `- ${item.name} ($${(item.price_cents / 100).toFixed(2)})`).join('\n');

  return [
    "Restaurant menu policy for Mom's Biryani:",
    'You can only take orders for the exact menu items listed below.',
    'Do not infer or invent items that are not listed.',
    'If caller asks for anything not listed, politely say it is unavailable and suggest listed alternatives.',
    'Before finalizing an order, read back item names, quantities, and pickup time.',
    'Allowed menu items:',
    menuLines
  ].join('\n');
}

export async function reconcileStaleInProgressCalls(staleAfterMinutes = 3) {
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60_000).toISOString();
  const { data: staleRows, error } = await supabase
    .from('calls')
    .select('id,twilio_call_sid,started_at')
    .eq('status', 'in_progress')
    .lt('created_at', cutoff);

  if (error || !staleRows || staleRows.length === 0) return 0;

  const { error: updateError } = await supabase
    .from('calls')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .in(
      'id',
      staleRows.map((r) => r.id)
    );

  if (updateError) throw updateError;

  logger.warn(
    { count: staleRows.length, staleAfterMinutes, callSids: staleRows.map((r) => r.twilio_call_sid) },
    'Reconciled stale in_progress calls to completed'
  );
  return staleRows.length;
}

type ElevenLabsDataCollection = Record<string, { value: unknown; rationale?: string | null }>;

function looksLikeFallbackName(name: string) {
  const lowered = (name ?? '').toLowerCase().trim();
  return !lowered || lowered.startsWith('caller ') || lowered === 'caller' || lowered.includes('phone customer');
}

function buildStructuredFromDataCollection(params: {
  twilioCallSid: string;
  provider: ConversationProvider;
  fromNumber: string | null;
  dc: ElevenLabsDataCollection;
  menuRows: Array<{ id: string; name: string; price_cents: number }>;
  userTranscript?: string;
  assistantTranscript?: string;
  messages?: Array<{ role: string; text: string }>;
}): StructuredCallOutcome | null {
  const { twilioCallSid, provider, fromNumber, dc, menuRows, userTranscript = '', assistantTranscript = '', messages = [] } = params;

  const str = (key: string): string =>
    typeof dc[key]?.value === 'string' ? (dc[key]!.value as string).trim() : '';
  const num = (key: string): number | null => {
    const v = dc[key]?.value;
    return typeof v === 'number' ? v : typeof v === 'string' && v ? Number(v) : null;
  };
  const bool = (key: string): boolean => Boolean(dc[key]?.value);

  const dcName = str('customer_name');
  // Priority: DC field → sequence inference (most reliable) → regex patterns
  const sequenceName = !dcName && messages.length > 0 ? inferNameFromMessages(messages) : null;
  const regexName = !dcName && !sequenceName ? extractCustomerName(userTranscript, assistantTranscript) : null;
  const resolvedName = dcName || sequenceName || regexName;
  const customerName = resolvedName
    ? resolvedName.replace(/\b\w/g, (c) => c.toUpperCase())
    : fromNumber ? `Caller ${fromNumber.replace(/\D/g, '').slice(-4)}` : 'Caller';
  const hasActualName = Boolean(resolvedName);
  const callerPhone = fromNumber || str('phone_number');
  const callType = str('call_type').toLowerCase();
  const itemsText = str('order_items');
  const totalFromDc = num('total_amount');
  const pickupTime = str('pickup_time') || '20 minutes';
  const partySizeFromDc = num('party_size');
  const reservationDate = str('reservation_date') || 'today';
  const reservationTime = str('reservation_time') || '';

  const isAdvanceOrder = bool('advance_order');
  const advancePickupDate = str('advance_pickup_date');
  const advancePickupTime = str('advance_pickup_time');

  const items = itemsText ? parseElevenLabsDcItems(itemsText, menuRows) : [];
  const totalCents = totalFromDc != null
    ? Math.round(totalFromDc * 100)
    : items.reduce((s, i) => s + i.lineTotalCents, 0);

  const indicatesOrder = callType === 'order' || bool('is_order') || items.length > 0;
  const indicatesReservation = callType === 'reservation' || bool('is_reservation');
  const indicatesCancel = bool('order_cancelled');

  return {
    schema_version: '1.0',
    twilio_call_sid: twilioCallSid,
    provider,
    customer: { name: customerName, has_actual_name: hasActualName, caller_phone: callerPhone || null },
    intents: { order: indicatesOrder && !indicatesCancel, reservation: indicatesReservation, cancel: indicatesCancel },
    order: { pickup_time: pickupTime, total_cents: totalCents, is_advance_order: isAdvanceOrder, advance_pickup_date: advancePickupDate, advance_pickup_time: advancePickupTime, items },
    reservation: {
      party_size: partySizeFromDc ?? 2,
      date: reservationDate,
      reservation_time: reservationTime || pickupTime,
      occasion: str('occasion') || 'Not specified',
      status: (hasActualName && partySizeFromDc != null && reservationTime) ? 'confirmed' : 'escalated'
    }
  };
}

export async function persistFallbackOrderAndReservationFromCall(
  twilioCallSid: string,
  overrideSummary?: string | null,
  elevenLabsDataCollection?: ElevenLabsDataCollection | null
) {
  const { data: callRow } = await supabase
    .from('calls')
    .select('id,from_number,provider')
    .eq('twilio_call_sid', twilioCallSid)
    .maybeSingle();

  if (!callRow) return;

  const { data: transcriptRows } = await supabase
    .from('call_messages')
    .select('role,text,created_at')
    .eq('call_id', callRow.id)
    .order('created_at', { ascending: true });

  const transcript = (transcriptRows ?? [])
    .map((r) => `${r.role}: ${r.text}`)
    .join('\n')
    .toLowerCase();
  const userTranscript = (transcriptRows ?? [])
    .filter((r) => r.role === 'user')
    .map((r) => r.text)
    .join('\n')
    .toLowerCase();
  const assistantTranscript = (transcriptRows ?? [])
    .filter((r) => r.role === 'assistant')
    .map((r) => r.text)
    .join('\n')
    .toLowerCase();

  if (!transcript.trim()) return;

  const existingStructured = await getStructuredOutputByCallSid(twilioCallSid);
  let structured: StructuredCallOutcome;

  // Always rebuild from ElevenLabs DC when available — it is the most accurate source and
  // may include items (beverages, desserts) the transcript-based parser missed.
  // Only reuse cached structured output when DC is absent.
  const hasFreshDC = elevenLabsDataCollection != null;
  const hasCachedOutput = existingStructured?.payload != null;

  if (hasCachedOutput && !hasFreshDC) {
    structured = existingStructured!.payload as unknown as StructuredCallOutcome;
  } else {
    const { data: menuRows } = await supabase.from('menu_items').select('id,name,price_cents').eq('active', true);
    const safeMenuRows = (menuRows as Array<{ id: string; name: string; price_cents: number }> | null) ?? [];

    const dcStructured = elevenLabsDataCollection
      ? buildStructuredFromDataCollection({
          twilioCallSid,
          provider: normalizeConversationProvider(callRow.provider),
          fromNumber: callRow.from_number,
          dc: elevenLabsDataCollection,
          menuRows: safeMenuRows,
          userTranscript,
          assistantTranscript,
          messages: transcriptRows ?? []
        })
      : null;

    structured = dcStructured ?? buildStructuredCallOutcome({
      twilioCallSid,
      provider: normalizeConversationProvider(callRow.provider),
      fromNumber: callRow.from_number,
      transcript,
      userTranscript,
      assistantTranscript,
      menuRows: safeMenuRows
    });

    const source = dcStructured ? 'model_tool' : 'transcript_fallback';
    await upsertStructuredOutput({
      twilioCallSid,
      provider: normalizeConversationProvider(callRow.provider),
      source,
      payload: structured
    }).catch((error) => logger.error({ error, twilioCallSid }, 'Failed to upsert structured output'));
    await insertEvent({
      twilioCallSid,
      provider: normalizeConversationProvider(callRow.provider),
      eventType: 'structured_output',
      payload: structured as unknown as Record<string, unknown>
    }).catch(() => undefined);
  }

  // from_number on the call row is the authoritative ElevenLabs external_number (real caller ID).
  // Only fall back to DC phone_number when the call has no from_number at all.
  const dcPhone = structured.customer.caller_phone;
  if (!callRow.from_number && dcPhone) {
    await Promise.resolve(
      supabase.from('calls').update({ from_number: dcPhone }).eq('id', callRow.id)
    ).catch(() => undefined);
    callRow.from_number = dcPhone;
  }

  await materializeFromStructuredOutput(
    twilioCallSid,
    callRow.from_number ?? null,
    structured,
    overrideSummary ?? null
  );

  const callSummary = [
    `Call handled with ${structured.customer.name}.`,
    structured.intents.order ? 'Order intent detected.' : null,
    structured.intents.reservation ? 'Reservation intent detected.' : null,
    structured.order.items.length > 0
      ? `Menu items mentioned: ${structured.order.items.map((item) => item.name).slice(0, 5).join(', ')}.`
      : null
  ]
    .filter(Boolean)
    .join(' ');

  const finalSummary = overrideSummary?.trim() || callSummary;
  if (finalSummary.trim()) {
    await supabase.from('calls').update({ summary: finalSummary }).eq('id', callRow.id);
  }
}

export type StructuredCallOutcome = {
  schema_version: '1.0';
  twilio_call_sid: string;
  provider: ConversationProvider;
  customer: {
    name: string;
    has_actual_name: boolean;
    caller_phone: string | null;
  };
  intents: {
    order: boolean;
    reservation: boolean;
    cancel: boolean;
  };
  order: {
    pickup_time: string;
    total_cents: number;
    is_advance_order: boolean;
    advance_pickup_date: string;
    advance_pickup_time: string;
    items: Array<{ name: string; menuItemId?: string; customName?: string; qty: number; lineTotalCents: number; isCustom?: boolean }>;
  };
  reservation: {
    party_size: number;
    date: string;
    reservation_time: string;
    occasion: string;
    status: 'confirmed' | 'escalated';
  };
};

export async function materializeFromStructuredOutput(
  twilioCallSid: string,
  fromNumber: string | null,
  structured: StructuredCallOutcome,
  elevenLabsSummary?: string | null
) {
  const tag = `[auto:${twilioCallSid}]`;
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id,customer_name,caller_phone,status')
    .ilike('notes', `%${tag}%`)
    .limit(1)
    .maybeSingle();

  const { data: existingReservation } = await supabase
    .from('reservations')
    .select('id')
    .ilike('notes', `%${tag}%`)
    .limit(1)
    .maybeSingle();

  // If ElevenLabs data_collection gave us a real name or phone, patch the existing order and call row.
  const dcPhone = structured.customer.caller_phone;
  const dcName = structured.customer.has_actual_name ? structured.customer.name : null;

  if (existingOrder && (dcName || dcPhone)) {
    const patch: Record<string, string> = {};
    if (dcName && looksLikeFallbackName(existingOrder.customer_name ?? '')) patch.customer_name = dcName;
    if (dcPhone && !existingOrder.caller_phone) patch.caller_phone = dcPhone;
    if (Object.keys(patch).length > 0) {
      await Promise.resolve(
        supabase.from('orders').update(patch).eq('id', existingOrder.id)
      ).catch(() => undefined);
    }
  }

  // Always sync the best-known phone back onto the calls row so future lookups work.
  const resolvedPhone = fromNumber || dcPhone || null;
  if (resolvedPhone) {
    await Promise.resolve(
      supabase
        .from('calls')
        .update({ from_number: resolvedPhone })
        .eq('twilio_call_sid', twilioCallSid)
        .is('from_number', null)
    ).catch(() => undefined);

    // If DC gave us a phone that differs from Twilio's from_number, prefer the DC value
    // (ElevenLabs data_collection phone_number is what the caller stated explicitly).
    if (dcPhone && dcPhone !== fromNumber) {
      await Promise.resolve(
        supabase
          .from('calls')
          .update({ from_number: dcPhone })
          .eq('twilio_call_sid', twilioCallSid)
      ).catch(() => undefined);
    }
  }

  // Voice cancellation — customer said cancel during call
  if (structured.intents.cancel && existingOrder) {
    const now = new Date().toISOString();
    await Promise.allSettled([
      supabase.from('orders').update({
        status: 'cancelled',
        cancelled_at: now,
        cancelled_reason: 'Customer cancelled during call'
      }).eq('id', existingOrder.id),
      supabase.from('order_audit_log').insert({
        order_id: existingOrder.id,
        action: 'order_cancelled',
        changed_by: 'voice_agent',
        old_values: { status: existingOrder.status ?? 'new' },
        new_values: { status: 'cancelled' },
        note: `Customer cancelled during call (${twilioCallSid})`
      })
    ]);
    logger.info({ orderId: existingOrder.id, twilioCallSid }, 'Order cancelled by voice agent');
  }

  if (structured.intents.order && !existingOrder) {
    // Use exact ElevenLabs transcript_summary when available; fall back to generated text.
    const generatedSummary = [
      `${structured.customer.name} called to place a pickup order.`,
      structured.order.items.length > 0
        ? `Items discussed: ${structured.order.items.map((item) => item.name).join(', ')}.`
        : 'Items were discussed and confirmed on call.',
      `Pickup time confirmed as ${structured.order.pickup_time}.`
    ].join(' ');
    const orderSummary = `${elevenLabsSummary?.trim() || generatedSummary} ${tag} auto-captured from transcript`;
    await createOrder({
      callerPhone: fromNumber ?? undefined,
      customerName: structured.customer.name,
      pickupTime: structured.order.pickup_time,
      notes: orderSummary,
      totalCents: structured.order.total_cents,
      isAdvanceOrder: structured.order.is_advance_order,
      advancePickupDate: structured.order.advance_pickup_date || undefined,
      advancePickupTime: structured.order.advance_pickup_time || undefined,
      items: structured.order.items.map((item) => ({
        menuItemId: item.menuItemId,
        customName: item.customName ?? (item.isCustom ? item.name : undefined),
        qty: item.qty,
        lineTotalCents: item.lineTotalCents
      }))
    });

    // Log creation
    const { data: newOrder } = await supabase.from('orders').select('id').ilike('notes', `%${tag}%`).limit(1).maybeSingle();
    if (newOrder?.id) {
      await supabase.from('order_audit_log').insert({
        order_id: newOrder.id,
        action: 'order_created',
        changed_by: 'voice_agent',
        new_values: {
          customer: structured.customer.name,
          items: structured.order.items.map((i) => `${i.qty}x ${i.name}`),
          total_cents: structured.order.total_cents,
          pickup_time: structured.order.pickup_time
        },
        note: `Created via ${structured.provider} call (${twilioCallSid})`
      }).then(undefined, () => undefined);
    }

    // Fire-and-forget SMS notifications. Promise.allSettled isolates failures.
    const { data: settings } = await supabase
      .from('restaurant_settings')
      .select('escalation_phone')
      .limit(1)
      .maybeSingle();

    const smsItems = structured.order.items.map((i) => ({ name: i.name, qty: i.qty }));
    await Promise.allSettled([
      sendCustomerOrderSms({
        to: fromNumber,
        customerName: structured.customer.name,
        items: smsItems,
        totalCents: structured.order.total_cents,
        pickupTime: structured.order.pickup_time
      }),
      sendRestaurantOrderSms({
        to: settings?.escalation_phone ?? null,
        customerName: structured.customer.name,
        customerPhone: fromNumber,
        items: smsItems,
        totalCents: structured.order.total_cents,
        pickupTime: structured.order.pickup_time
      })
    ]);
  } else if (structured.intents.order && existingOrder && structured.order.items.length > 0) {
    // Order already exists (created by real-time Deepgram pass). If it has no items yet,
    // backfill them from the DC data — this is the common case where beverages/desserts
    // were mentioned but the transcript parser missed them.
    const { data: existingItems } = await supabase
      .from('order_items')
      .select('id')
      .eq('order_id', existingOrder.id)
      .limit(1);

    if (!existingItems?.length) {
      logger.info({ orderId: existingOrder.id, itemCount: structured.order.items.length }, 'Backfilling order items from DC data');
      const insertResult = await supabase.from('order_items').insert(
        structured.order.items.map((item) => ({
          order_id: existingOrder.id,
          menu_item_id: item.menuItemId ?? null,
          custom_name: item.customName ?? (item.isCustom ? item.name : null),
          qty: item.qty,
          modifier_json: [],
          line_total_cents: item.lineTotalCents ?? 0
        }))
      );
      if (insertResult.error) logger.error({ error: insertResult.error }, 'Failed to backfill order items');

      // Update total if DC has a better value
      if (structured.order.total_cents > 0) {
        await Promise.resolve(
          supabase.from('orders')
            .update({ total_cents: structured.order.total_cents })
            .eq('id', existingOrder.id)
        ).catch(() => undefined);
      }
    }
  }

  if (structured.intents.reservation && !existingReservation) {
    const reservationSummary = [
      `${structured.customer.name} called to reserve a table.`,
      `Reservation date: ${structured.reservation.date}.`,
      `Party size: ${structured.reservation.party_size}.`,
      `Requested reservation time: ${structured.reservation.reservation_time}.`,
      `Occasion: ${structured.reservation.occasion}.`,
      `${tag} auto-captured from transcript`
    ].join(' ');
    await createReservation({
      callerPhone: fromNumber ?? undefined,
      guestName: structured.customer.name,
      partySize: structured.reservation.party_size,
      reservationTime: structured.reservation.reservation_time,
      notes: reservationSummary,
      status: structured.reservation.status
    });
  }
}

function buildStructuredCallOutcome(params: {
  twilioCallSid: string;
  provider: ConversationProvider;
  fromNumber: string | null;
  transcript: string;
  userTranscript: string;
  assistantTranscript: string;
  menuRows: Array<{ id: string; name: string; price_cents: number }>;
}): StructuredCallOutcome {
  const { twilioCallSid, provider, fromNumber, transcript, userTranscript, assistantTranscript, menuRows } = params;
  const inferredPhone = extractCallerPhone(userTranscript) ?? extractCallerPhone(transcript);
  const resolvedCallerPhone = fromNumber ?? inferredPhone;
  const cleanedName = extractCustomerName(userTranscript, assistantTranscript);
  const hasActualName = Boolean(cleanedName);
  const fallbackCustomerName = resolvedCallerPhone ? `Caller ${resolvedCallerPhone.replace(/\D/g, '').slice(-4)}` : 'Caller';
  const customerName = hasActualName ? titleCase(cleanedName ?? '') : fallbackCustomerName;

  const timeMatch = transcript.match(/(\d{1,2}(:\d{2})?\s?(am|pm))/i);
  const pickupTime = timeMatch?.[1] ?? '20 minutes';

  const assistantOrderSignals = assistantTranscript
    .split('\n')
    .filter((line) =>
      line.includes('your order') || line.includes('you ordered') || line.includes('order for') ||
      line.includes('confirm') || line.includes('summary') || line.includes('total') || line.includes('recap')
    )
    .join(' ');
  const finalReadback = extractFinalReadbackSection(assistantTranscript);
  const finalReadbackItems = extractConfirmedMenuItems(finalReadback, menuRows);
  const signalItems = extractConfirmedMenuItems(`${assistantOrderSignals}\n${userTranscript}`, menuRows);
  const fullItems = extractConfirmedMenuItems(assistantTranscript, menuRows);
  const items =
    finalReadbackItems.length > 0 ? finalReadbackItems :
    signalItems.length > 0 ? signalItems :
    fullItems;
  const totalCents =
    extractTotalCentsFromAssistantTranscript(finalReadback || assistantTranscript) ??
    items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const indicatesCancel =
    transcript.includes('cancel my order') || transcript.includes('cancel the order') ||
    transcript.includes('order is cancelled') || transcript.includes('order cancelled');
  const indicatesOrder = (transcript.includes('order') || items.length > 0) && !indicatesCancel;
  const indicatesReservation =
    transcript.includes('reservation') || transcript.includes('reserve') || transcript.includes('table for');

  const combinedReservationText = `${userTranscript}\n${assistantTranscript}`.toLowerCase();
  const partySize = extractPartySize(combinedReservationText);
  const hasPartySize = partySize !== null;
  const dateMatch =
    userTranscript.match(/\b(today|tonight|tomorrow)\b/i) ??
    userTranscript.match(/\bon\s+([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)/i);
  const reservationDate = dateMatch?.[1] ?? (dateMatch?.[0] ?? 'today');
  const occasionMatch =
    userTranscript.match(
      /\b(?:for|occasion is|it'?s|its)\s+(birthday|anniversary|date night|business dinner|family dinner|celebration|engagement|meeting)\b/i
    ) ?? userTranscript.match(/\b(birthday|anniversary|date night|business dinner|family dinner|celebration|engagement|meeting)\b/i);
  const occasion = occasionMatch?.[1] ?? 'Not specified';
  const hasReservationTime = Boolean(timeMatch?.[1]);
  const assistantConfirmedReservation = /(?:reservation|table).*(?:confirmed|reserved)|you have a reservation|your table.*reserved/i.test(
    assistantTranscript
  );

  return {
    schema_version: '1.0',
    twilio_call_sid: twilioCallSid,
    provider,
    customer: {
      name: customerName,
      has_actual_name: hasActualName,
      caller_phone: resolvedCallerPhone
    },
    intents: {
      order: indicatesOrder,
      reservation: indicatesReservation,
      cancel: indicatesCancel
    },
    order: {
      pickup_time: pickupTime,
      total_cents: totalCents,
      is_advance_order: false,
      advance_pickup_date: '',
      advance_pickup_time: '',
      items
    },
    reservation: {
      party_size: hasPartySize ? partySize ?? 2 : 2,
      date: reservationDate,
      reservation_time: hasReservationTime ? pickupTime : 'ASAP',
      occasion,
      status:
        (assistantConfirmedReservation && hasPartySize && hasReservationTime) ||
        (hasActualName && hasPartySize && hasReservationTime)
          ? 'confirmed'
          : 'escalated'
    }
  };
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (m) => m.toUpperCase());
}

function extractPartySize(text: string): number | null {
  const wordToNumber: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12
  };

  const numericMatch =
    text.match(/party\s+of\s+(\d{1,2})/i) ??
    text.match(/table\s+for\s+(\d{1,2})/i) ??
    text.match(/for\s+(\d{1,2})\s+(?:people|persons|guests)/i);
  if (numericMatch?.[1]) return Number(numericMatch[1]);

  const wordMatch =
    text.match(/party\s+of\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i) ??
    text.match(/table\s+for\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i) ??
    text.match(/for\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:people|persons|guests)\b/i);
  if (wordMatch?.[1]) return wordToNumber[wordMatch[1].toLowerCase()] ?? null;

  return null;
}

function extractCallerPhone(text: string): string | null {
  const matches = text.match(/(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/g);
  if (!matches || matches.length === 0) return null;

  const digits = matches[matches.length - 1]?.replace(/\D/g, '') ?? '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
