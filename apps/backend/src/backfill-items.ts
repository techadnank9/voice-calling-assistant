/**
 * Backfill script: re-processes past orders that have missing or incomplete items
 * by re-extracting them from call_structured_outputs (ElevenLabs data_collection_results)
 * using the fuzzy parseElevenLabsDcItems matcher.
 *
 * Run with:
 *   npx tsx src/backfill-items.ts
 *
 * Safe to run multiple times — only patches orders that have fewer items than what
 * ElevenLabs reported, or orders with 0 items where DC has order_items data.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { createClient } from '@supabase/supabase-js';
import { parseElevenLabsDcItems } from './orderExtraction.js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

interface MenuRow {
  id: string;
  name: string;
  price_cents: number;
}

interface StructuredPayload {
  order?: {
    items?: unknown[];
    total_cents?: number;
    pickup_time?: string;
  };
}

interface StructuredOutputRow {
  call_id: string;
  payload: StructuredPayload;
  source: string;
}

interface CallRow {
  id: string;
  twilio_call_sid: string;
}

interface CallEventRow {
  call_id: string;
  payload: Record<string, unknown>;
}

interface OrderRow {
  id: string;
  notes: string | null;
  total_cents: number;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  custom_name: string | null;
  qty: number;
  line_total_cents: number;
}

function extractCallSidFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/\[auto:([^\]]+)\]/i);
  return match?.[1] ?? null;
}

function getDcOrderItemsText(eventPayload: Record<string, unknown>): string {
  const data = eventPayload?.data as Record<string, unknown> | undefined;
  const analysis = data?.analysis as Record<string, unknown> | undefined;
  const dcResults = (
    (analysis?.data_collection_results ?? analysis?.data_collection) as
      | Record<string, { value?: unknown }>
      | undefined
  );
  if (!dcResults) return '';
  const val = dcResults['order_items']?.value;
  return typeof val === 'string' ? val.trim() : '';
}

async function main() {
  // 1. Load all active menu items
  console.log('🍽️  Loading menu items...');
  const { data: menuData, error: menuError } = await supabase
    .from('menu_items')
    .select('id, name, price_cents')
    .eq('active', true);

  if (menuError) {
    console.error('❌ Failed to load menu items:', menuError.message);
    process.exit(1);
  }

  const menuRows = (menuData ?? []) as MenuRow[];
  console.log(`   Found ${menuRows.length} menu item(s).`);

  // 2. Load all structured outputs
  console.log('\n📦 Loading call_structured_outputs...');
  const { data: structuredData, error: structuredError } = await supabase
    .from('call_structured_outputs')
    .select('call_id, payload, source');

  if (structuredError) {
    console.error('❌ Failed to load structured outputs:', structuredError.message);
    process.exit(1);
  }

  const structuredRows = (structuredData ?? []) as StructuredOutputRow[];
  console.log(`   Found ${structuredRows.length} structured output row(s).`);

  // 3. Load raw ElevenLabs DC events (to get original order_items text)
  console.log('\n📡 Loading raw ElevenLabs post_call_transcription events...');
  const { data: eventData, error: eventError } = await supabase
    .from('call_events')
    .select('call_id, payload')
    .eq('event_type', 'elevenlabs.post_call_transcription');

  if (eventError) {
    console.error('❌ Failed to load call_events:', eventError.message);
    process.exit(1);
  }

  const eventRows = (eventData ?? []) as CallEventRow[];
  console.log(`   Found ${eventRows.length} ElevenLabs event(s).`);

  // Build map: call_id → raw DC order_items text
  const dcItemsTextByCallId = new Map<string, string>();
  for (const ev of eventRows) {
    const text = getDcOrderItemsText(ev.payload);
    if (text) dcItemsTextByCallId.set(ev.call_id, text);
  }

  // 4. Fetch all call rows to map twilio_call_sid → call row
  const callIds = structuredRows.map((r) => r.call_id);
  console.log(`\n📞 Fetching ${callIds.length} call row(s)...`);

  const { data: callData, error: callError } = await supabase
    .from('calls')
    .select('id, twilio_call_sid')
    .in('id', callIds);

  if (callError) {
    console.error('❌ Failed to fetch calls:', callError.message);
    process.exit(1);
  }

  const calls = (callData ?? []) as CallRow[];
  const callBySid = new Map<string, CallRow>();
  for (const call of calls) {
    if (call.twilio_call_sid) callBySid.set(call.twilio_call_sid, call);
  }

  // 5. Fetch all orders
  console.log('\n🛒 Fetching all orders...');
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('id, notes, total_cents');

  if (orderError) {
    console.error('❌ Failed to fetch orders:', orderError.message);
    process.exit(1);
  }

  const orders = (orderData ?? []) as OrderRow[];
  console.log(`   Found ${orders.length} order(s).`);

  // 6. Fetch all existing order_items
  console.log('\n📋 Fetching existing order_items...');
  const { data: itemData, error: itemError } = await supabase
    .from('order_items')
    .select('id, order_id, menu_item_id, custom_name, qty, line_total_cents');

  if (itemError) {
    console.error('❌ Failed to fetch order_items:', itemError.message);
    process.exit(1);
  }

  const existingItems = (itemData ?? []) as OrderItemRow[];
  const itemsByOrderId = new Map<string, OrderItemRow[]>();
  for (const item of existingItems) {
    const bucket = itemsByOrderId.get(item.order_id) ?? [];
    bucket.push(item);
    itemsByOrderId.set(item.order_id, bucket);
  }

  // Build call_id → structured payload map
  const structuredByCallId = new Map<string, StructuredOutputRow>();
  for (const row of structuredRows) {
    structuredByCallId.set(row.call_id, row);
  }

  let patchedOrders = 0;
  let skippedOrders = 0;
  let noMatchOrders = 0;
  let insertedItems = 0;

  console.log('\n🔧 Processing orders...\n');

  for (const order of orders) {
    const sid = extractCallSidFromNotes(order.notes);
    if (!sid) {
      noMatchOrders++;
      continue;
    }

    const call = callBySid.get(sid);
    if (!call) {
      noMatchOrders++;
      continue;
    }

    const structured = structuredByCallId.get(call.id);
    if (!structured) {
      noMatchOrders++;
      continue;
    }

    // Get the raw DC order_items text (preferred) or fall back to structured payload items
    const dcItemsText = dcItemsTextByCallId.get(call.id) ?? '';
    const structuredItems = (structured.payload?.order?.items ?? []) as Array<{
      name?: string;
      menuItemId?: string;
      qty?: number;
      lineTotalCents?: number;
      isCustom?: boolean;
    }>;

    // Skip if there's nothing to work with
    if (!dcItemsText && structuredItems.length === 0) {
      skippedOrders++;
      continue;
    }

    // Parse items from DC text using fuzzy matcher
    const parsedItems = dcItemsText
      ? parseElevenLabsDcItems(dcItemsText, menuRows)
      : structuredItems.map((i) => ({
          name: i.name ?? 'Unknown item',
          menuItemId: i.menuItemId,
          qty: i.qty ?? 1,
          lineTotalCents: i.lineTotalCents ?? 0,
          isCustom: i.isCustom ?? false
        }));

    if (parsedItems.length === 0) {
      skippedOrders++;
      continue;
    }

    const existing = itemsByOrderId.get(order.id) ?? [];

    // Determine which parsed items are genuinely missing
    const missingItems = parsedItems.filter((parsed) => {
      // Consider an item missing if no existing item shares the same menu_item_id
      // or the same custom_name (case-insensitive)
      if (parsed.menuItemId) {
        return !existing.some((e) => e.menu_item_id === parsed.menuItemId);
      }
      const parsedNameLower = parsed.name.toLowerCase();
      return !existing.some(
        (e) =>
          (e.custom_name ?? '').toLowerCase() === parsedNameLower ||
          (e.menu_item_id == null && e.custom_name == null)
      );
    });

    if (missingItems.length === 0) {
      skippedOrders++;
      continue;
    }

    console.log(`  📝 Order ${order.id.slice(0, 8)}…`);
    console.log(`     Existing items : ${existing.length}`);
    console.log(`     Parsed items   : ${parsedItems.length}`);
    console.log(`     Missing items  : ${missingItems.length}`);

    const insertRows = missingItems.map((item) => ({
      order_id: order.id,
      menu_item_id: item.menuItemId ?? null,
      custom_name: item.isCustom ? item.name : null,
      qty: item.qty,
      modifier_json: [],
      line_total_cents: item.lineTotalCents
    }));

    const { error: insertError } = await supabase.from('order_items').insert(insertRows);

    if (insertError) {
      console.error(`     ❌ Insert failed: ${insertError.message}`);
      continue;
    }

    for (const item of missingItems) {
      const label = item.isCustom ? `"${item.name}" (custom)` : `"${item.name}"`;
      console.log(`     ✅ Inserted ${item.qty}x ${label}  $${(item.lineTotalCents / 100).toFixed(2)}`);
      insertedItems++;
    }

    // Also recalculate total_cents if the order total looks wrong
    const existingTotal = existing.reduce((sum, i) => sum + i.line_total_cents, 0);
    const missingTotal = missingItems.reduce((sum, i) => sum + i.lineTotalCents, 0);
    const newTotal = existingTotal + missingTotal;

    if (newTotal !== order.total_cents && newTotal > 0) {
      const { error: totalError } = await supabase
        .from('orders')
        .update({ total_cents: newTotal })
        .eq('id', order.id);

      if (totalError) {
        console.error(`     ⚠️  Failed to update total: ${totalError.message}`);
      } else {
        console.log(
          `     💰 Total updated: $${(order.total_cents / 100).toFixed(2)} → $${(newTotal / 100).toFixed(2)}`
        );
      }
    }

    patchedOrders++;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Patched orders:    ${patchedOrders}`);
  console.log(`➕ Items inserted:    ${insertedItems}`);
  console.log(`⏭️  Skipped orders:    ${skippedOrders} (already complete)`);
  console.log(`❓ No match:          ${noMatchOrders} (no structured output)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Done!');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
