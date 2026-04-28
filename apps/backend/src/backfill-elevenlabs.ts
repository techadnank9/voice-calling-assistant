/**
 * Backfill script: patches past orders with real customer names and phone numbers
 * sourced from call_structured_outputs (populated by ElevenLabs post_call_transcription webhooks).
 *
 * Run with:
 *   npx tsx src/backfill-elevenlabs.ts
 *
 * Safe to run multiple times — only updates rows that still have fallback/missing values.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

interface StructuredCustomer {
  name?: string | null;
  has_actual_name?: boolean;
  caller_phone?: string | null;
}

interface StructuredPayload {
  customer?: StructuredCustomer;
}

interface StructuredOutputRow {
  call_id: string;
  payload: StructuredPayload;
}

interface CallRow {
  id: string;
  twilio_call_sid: string;
  from_number: string | null;
}

interface OrderRow {
  id: string;
  customer_name: string;
  caller_phone: string | null;
  notes: string | null;
}

function looksLikeFallbackName(name: string | null | undefined): boolean {
  const lowered = (name ?? '').toLowerCase().trim();
  return !lowered || lowered.startsWith('caller ') || lowered === 'caller' || lowered.includes('phone customer');
}

function extractCallSidFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  // Matches both Twilio SIDs (CA...) and ElevenLabs conversation IDs
  const match = notes.match(/\[auto:([^\]]+)\]/i);
  return match?.[1] ?? null;
}

async function main() {
  console.log('🔍 Fetching all structured outputs from call_structured_outputs...');

  const { data: structuredRows, error: structuredError } = await supabase
    .from('call_structured_outputs')
    .select('call_id, payload');

  if (structuredError) {
    console.error('❌ Failed to fetch structured outputs:', structuredError.message);
    process.exit(1);
  }

  const rows = (structuredRows ?? []) as StructuredOutputRow[];
  console.log(`   Found ${rows.length} structured output row(s).`);

  if (rows.length === 0) {
    console.log('ℹ️  Nothing to backfill.');
    return;
  }

  // Build a map of call_id → structured payload
  const structuredByCallId = new Map<string, StructuredPayload>();
  for (const row of rows) {
    structuredByCallId.set(row.call_id, row.payload);
  }

  // Fetch all call rows for those call_ids
  const callIds = [...structuredByCallId.keys()];
  console.log(`\n🔍 Fetching ${callIds.length} call row(s)...`);

  const { data: callRows, error: callError } = await supabase
    .from('calls')
    .select('id, twilio_call_sid, from_number')
    .in('id', callIds);

  if (callError) {
    console.error('❌ Failed to fetch calls:', callError.message);
    process.exit(1);
  }

  const calls = (callRows ?? []) as CallRow[];
  const callById = new Map<string, CallRow>();
  const callBySid = new Map<string, CallRow>();
  for (const call of calls) {
    callById.set(call.id, call);
    if (call.twilio_call_sid) callBySid.set(call.twilio_call_sid, call);
  }

  // Fetch all orders
  console.log('\n🔍 Fetching all orders...');
  const { data: orderRows, error: orderError } = await supabase
    .from('orders')
    .select('id, customer_name, caller_phone, notes');

  if (orderError) {
    console.error('❌ Failed to fetch orders:', orderError.message);
    process.exit(1);
  }

  const orders = (orderRows ?? []) as OrderRow[];
  console.log(`   Found ${orders.length} order(s).`);

  let patchedCount = 0;
  let skippedCount = 0;
  let noMatchCount = 0;

  for (const order of orders) {
    const sid = extractCallSidFromNotes(order.notes);
    if (!sid) {
      noMatchCount++;
      continue;
    }

    // Find the call row by SID
    const call = callBySid.get(sid);
    if (!call) {
      noMatchCount++;
      continue;
    }

    // Find the structured output for this call
    const structured = structuredByCallId.get(call.id);
    if (!structured) {
      noMatchCount++;
      continue;
    }

    const customer = structured.customer;
    if (!customer) {
      noMatchCount++;
      continue;
    }

    const dcName = customer.has_actual_name && customer.name ? customer.name : null;
    const dcPhone = customer.caller_phone ?? null;

    const patch: Record<string, string> = {};

    // Only update name if the current one looks like a fallback
    if (dcName && looksLikeFallbackName(order.customer_name)) {
      patch.customer_name = dcName;
    }

    // Only update phone if it's currently missing
    if (dcPhone && !order.caller_phone) {
      patch.caller_phone = dcPhone;
    }

    if (Object.keys(patch).length === 0) {
      skippedCount++;
      continue;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', order.id);

    if (updateError) {
      console.error(`  ❌ Failed to patch order ${order.id}:`, updateError.message);
    } else {
      const changes = Object.entries(patch)
        .map(([k, v]) => `${k} → "${v}"`)
        .join(', ');
      console.log(`  ✅ Order ${order.id.slice(0, 8)}…  ${changes}`);
      patchedCount++;
    }

    // Also update calls.from_number if DC has a better phone
    if (dcPhone && dcPhone !== call.from_number) {
      const { error: callUpdateError } = await supabase
        .from('calls')
        .update({ from_number: dcPhone })
        .eq('id', call.id);

      if (callUpdateError) {
        console.error(`  ⚠️  Failed to patch call ${call.id} from_number:`, callUpdateError.message);
      } else {
        console.log(`  📞 Call  ${call.id.slice(0, 8)}…  from_number → "${dcPhone}"`);
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Patched:       ${patchedCount} order(s)`);
  console.log(`⏭️  Skipped:       ${skippedCount} order(s) (already have real data)`);
  console.log(`❓ No match:      ${noMatchCount} order(s) (no structured output found)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Done!');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
