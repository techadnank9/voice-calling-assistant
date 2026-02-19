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
    'You are a professional concierge for New Delhi Restaurant.',
    'You can only take orders for the exact menu items listed below.',
    'If caller asks for anything not listed, politely say it is unavailable and offer listed alternatives.',
    'Before finalizing order, read back items, quantities, and pickup time.',
    'Allowed menu items:',
    menuLines
  ].join('\n');
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

  if (!transcript.trim()) return;

  const tag = `[auto:${twilioCallSid}]`;
  const nameMatch =
    transcript.match(/my name is\\s+([a-z]+(?:\\s+[a-z]+){0,2})/) ??
    transcript.match(/name\\s+is\\s+([a-z]+(?:\\s+[a-z]+){0,2})/);
  const customerName = nameMatch?.[1]
    ? nameMatch[1].replace(/\b\w/g, (m) => m.toUpperCase())
    : 'Phone Customer';

  const timeMatch = transcript.match(/(\\d{1,2}(:\\d{2})?\\s?(am|pm))/i);
  const timeValue = timeMatch?.[1] ?? 'ASAP';

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

  const { data: menuRows } = await supabase.from('menu_items').select('id,name,price_cents').eq('active', true);

  const matchedItems =
    menuRows?.filter((item) => transcript.includes(item.name.toLowerCase())).map((item) => ({
      menuItemId: item.id,
      qty: 1,
      lineTotalCents: item.price_cents
    })) ?? [];

  const totalCents = matchedItems.reduce((sum, item) => sum + (item.lineTotalCents ?? 0), 0);

  const indicatesOrder = transcript.includes('order') || matchedItems.length > 0;
  const indicatesReservation =
    transcript.includes('reservation') || transcript.includes('reserve') || transcript.includes('table for');

  if (indicatesOrder && !existingOrder) {
    await createOrder({
      callerPhone: callRow.from_number ?? undefined,
      customerName,
      pickupTime: timeValue,
      notes: `${tag} auto-captured from transcript`,
      totalCents: totalCents || 0,
      items: matchedItems
    });
  }

  if (indicatesReservation && !existingReservation) {
    const partyMatch = transcript.match(/table for\\s+(\\d+)/) ?? transcript.match(/party\\s+of\\s+(\\d+)/);
    const partySize = Number(partyMatch?.[1] ?? '2');
    await createReservation({
      callerPhone: callRow.from_number ?? undefined,
      guestName: customerName,
      partySize: Number.isFinite(partySize) ? partySize : 2,
      reservationTime: timeValue,
      notes: `${tag} auto-captured from transcript`,
      status: 'confirmed'
    });
  }
}
