import { createClient } from '@supabase/supabase-js';
import { env } from './config.js';
import { logger } from './logger.js';

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

export type CallStatus = 'ringing' | 'in_progress' | 'completed' | 'failed';

export async function upsertCall(params: {
  twilioCallSid: string;
  fromNumber?: string;
  toNumber?: string;
  status: CallStatus;
  startedAt?: string;
  endedAt?: string;
}) {
  const { data: existing } = await supabase
    .from('calls')
    .select('from_number,to_number,started_at,ended_at')
    .eq('twilio_call_sid', params.twilioCallSid)
    .maybeSingle();

  const payload = {
    twilio_call_sid: params.twilioCallSid,
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

export async function insertEvent(params: {
  twilioCallSid: string;
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
    payload: params.payload
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
  items: Array<{
    menuItemId?: string;
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
      status: 'new'
    })
    .select('id')
    .single();

  if (orderError || !order) throw orderError ?? new Error('Unable to create order');

  if (params.items.length > 0) {
    const { error: itemError } = await supabase.from('order_items').insert(
      params.items.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menuItemId ?? null,
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
    'Restaurant menu policy for New Delhi Restaurant:',
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

export async function persistFallbackOrderAndReservationFromCall(twilioCallSid: string) {
  const { data: callRow } = await supabase
    .from('calls')
    .select('id,from_number')
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
  if (existingStructured?.payload) {
    structured = existingStructured.payload as unknown as StructuredCallOutcome;
  } else {
    const { data: menuRows } = await supabase.from('menu_items').select('id,name,price_cents').eq('active', true);
    structured = buildStructuredCallOutcome({
      twilioCallSid,
      fromNumber: callRow.from_number,
      transcript,
      userTranscript,
      assistantTranscript,
      menuRows:
        (menuRows as Array<{ id: string; name: string; price_cents: number }> | null) ?? []
    });
    await upsertStructuredOutput({
      twilioCallSid,
      source: 'transcript_fallback',
      payload: structured
    }).catch((error) => logger.error({ error, twilioCallSid }, 'Failed to upsert structured fallback output'));
    await insertEvent({
      twilioCallSid,
      eventType: 'structured_output',
      payload: structured as unknown as Record<string, unknown>
    }).catch(() => undefined);
  }

  await materializeFromStructuredOutput(twilioCallSid, callRow.from_number, structured);

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

  if (callSummary.trim()) {
    await supabase.from('calls').update({ summary: callSummary }).eq('id', callRow.id);
  }
}

export type StructuredCallOutcome = {
  schema_version: '1.0';
  twilio_call_sid: string;
  customer: {
    name: string;
    has_actual_name: boolean;
    caller_phone: string | null;
  };
  intents: {
    order: boolean;
    reservation: boolean;
  };
  order: {
    pickup_time: string;
    total_cents: number;
    items: Array<{ name: string; menuItemId?: string; qty: number; lineTotalCents: number }>;
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
  structured: StructuredCallOutcome
) {
  const tag = `[auto:${twilioCallSid}]`;
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .ilike('notes', `%${tag}%`)
    .limit(1)
    .maybeSingle();

  const { data: existingReservation } = await supabase
    .from('reservations')
    .select('id')
    .ilike('notes', `%${tag}%`)
    .limit(1)
    .maybeSingle();

  if (structured.intents.order && !existingOrder) {
    const orderSummary = [
      `${structured.customer.name} called to place a pickup order.`,
      structured.order.items.length > 0
        ? `Items discussed: ${structured.order.items.map((item) => item.name).join(', ')}.`
        : 'Items were discussed and confirmed on call.',
      `Pickup time confirmed as ${structured.order.pickup_time}.`,
      `${tag} auto-captured from transcript`
    ].join(' ');
    await createOrder({
      callerPhone: fromNumber ?? undefined,
      customerName: structured.customer.name,
      pickupTime: structured.order.pickup_time,
      notes: orderSummary,
      totalCents: structured.order.total_cents,
      items: structured.order.items.map((item) => ({
        menuItemId: item.menuItemId,
        qty: item.qty,
        lineTotalCents: item.lineTotalCents
      }))
    });
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
  fromNumber: string | null;
  transcript: string;
  userTranscript: string;
  assistantTranscript: string;
  menuRows: Array<{ id: string; name: string; price_cents: number }>;
}): StructuredCallOutcome {
  const { twilioCallSid, fromNumber, transcript, userTranscript, assistantTranscript, menuRows } = params;
  const normalizedUser = userTranscript.replace(/[,\n]+/g, ' ');
  const nameMatch =
    normalizedUser.match(/my name is\s+(?:like\s+)?([a-z]+(?:\s+[a-z]+){0,2})/i) ??
    normalizedUser.match(/name\s+is\s+([a-z]+(?:\s+[a-z]+){0,2})/i) ??
    normalizedUser.match(/this is\s+([a-z]+(?:\s+[a-z]+){0,2})/i) ??
    normalizedUser.match(/it(?:\s|')?s\s+([a-z]+(?:\s+[a-z]+){0,2})/i) ??
    normalizedUser.match(/([a-z]+(?:\s+[a-z]+){0,2})\s+speaking/i) ??
    normalizedUser.match(/i(?:\s|')?m\s+([a-z]+(?:\s+[a-z]+){0,2})/i) ??
    normalizedUser.match(/under\s+(?:the\s+)?name\s+([a-z]+(?:\s+[a-z]+){0,2})/i);

  let extractedName = nameMatch?.[1] ?? null;
  if (!extractedName) {
    const assistantName =
      assistantTranscript.match(/thank you,\s*(mr\.|mrs\.|ms\.)?\s*([a-z]+(?:\s+[a-z]+){0,2})/i) ??
      assistantTranscript.match(/thanks,\s*(mr\.|mrs\.|ms\.)?\s*([a-z]+(?:\s+[a-z]+){0,2})/i);
    if (assistantName?.[2]) extractedName = assistantName[2];
  }

  const cleanedName = sanitizeExtractedName(extractedName);
  const hasActualName = Boolean(cleanedName);
  const fallbackCustomerName = fromNumber ? `Caller ${fromNumber.replace(/\D/g, '').slice(-4)}` : 'Caller';
  const customerName = hasActualName ? titleCase(cleanedName ?? '') : fallbackCustomerName;

  const timeMatch = transcript.match(/(\d{1,2}(:\d{2})?\s?(am|pm))/i);
  const pickupTime = timeMatch?.[1] ?? '20 minutes';

  const assistantOrderSignals = assistantTranscript
    .split('\n')
    .filter((line) => line.includes('your order') || line.includes('you ordered') || line.includes('order for'))
    .join(' ');
  const transcriptForItems = `${userTranscript}\n${assistantOrderSignals}`.toLowerCase();

  const items =
    menuRows
      ?.filter((item) => transcriptForItems.includes(item.name.toLowerCase()))
      .map((item) => ({
        name: item.name,
        menuItemId: item.id,
        qty: 1,
        lineTotalCents: item.price_cents
      })) ?? [];
  const totalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const indicatesOrder = transcript.includes('order') || items.length > 0;
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
    customer: {
      name: customerName,
      has_actual_name: hasActualName,
      caller_phone: fromNumber
    },
    intents: {
      order: indicatesOrder,
      reservation: indicatesReservation
    },
    order: {
      pickup_time: pickupTime,
      total_cents: totalCents,
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

function sanitizeExtractedName(name: string | null) {
  if (!name) return null;
  const cleaned = name
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const lowered = cleaned.toLowerCase();
  if (['fine', 'okay', 'ok', 'yes', 'no', 'name', 'my name', 'customer'].includes(lowered)) return null;
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  return cleaned;
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
