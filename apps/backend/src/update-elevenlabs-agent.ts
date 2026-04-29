/**
 * Patches the ElevenLabs agent with three things:
 *   1. data_collection fields for advance orders
 *   2. conversation_initiation_client_data_webhook → injects {{current_time}} at call start
 *   3. Prepends "Current time: {{current_time}}" to the system prompt if not already there
 *
 * Run once (or re-run safely — idempotent):
 *   npx tsx src/update-elevenlabs-agent.ts
 *
 * Requires: ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, APP_BASE_URL in environment.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? '';
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? '';
const APP_BASE_URL = (process.env.APP_BASE_URL ?? '').replace(/\/$/, '');

if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
  console.error('❌ Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID in environment.');
  process.exit(1);
}
if (!APP_BASE_URL) {
  console.error('❌ Missing APP_BASE_URL in environment (needed to set webhook URL).');
  process.exit(1);
}

const INITIATION_WEBHOOK_URL = `${APP_BASE_URL}/elevenlabs/initiation`;

const BASE = 'https://api.elevenlabs.io/v1/convai/agents';
const HEADERS = {
  'xi-api-key': ELEVENLABS_API_KEY,
  'Content-Type': 'application/json'
};

const ADVANCE_ORDER_FIELDS = {
  advance_order: {
    type: 'boolean',
    description:
      'True if the customer is placing an advance order (calling outside open hours and accepting a future pickup). False for regular immediate orders.'
  },
  advance_pickup_date: {
    type: 'string',
    description:
      'The pickup date for an advance order. Use "today" if pickup is later today, "tomorrow" for next day. Leave empty for regular orders.'
  },
  advance_pickup_time: {
    type: 'string',
    description:
      'The pickup time window for an advance order, e.g. "after 5:30 PM" or "after 11 AM". Leave empty for regular orders.'
  },
  order_cancelled: {
    type: 'boolean',
    description:
      'True if the customer explicitly cancelled their entire order during this call (said "cancel my order", "cancel everything", "never mind the whole thing", etc.). False by default.'
  }
};

const CURRENT_TIME_PREFIX = 'Current time: {{current_time}}. Caller phone: {{caller_phone_number}}.\n\nWhen capturing pickup_time, always store an actual clock time (e.g. "3:30 PM"), not a relative duration. If the customer says "20 minutes" or "in half an hour", add that to the current time and store the result (e.g. if current time is 3:10 PM and customer says 20 minutes, store "3:30 PM").\n\n';

async function getAgent(): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${ELEVENLABS_AGENT_ID}`, { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET agent failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function patchAgent(patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE}/${ELEVENLABS_AGENT_ID}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH agent failed ${res.status}: ${text}`);
  }
}

async function main() {
  console.log(`Fetching agent ${ELEVENLABS_AGENT_ID}...`);
  const agent = await getAgent();

  const conversationConfig = (agent.conversation_config ?? {}) as Record<string, unknown>;
  const agentConfig = (conversationConfig.agent ?? {}) as Record<string, unknown>;
  const promptConfig = (agentConfig.prompt ?? {}) as Record<string, unknown>;

  // ── 1. data_collection ────────────────────────────────────────────────────
  const existing = (conversationConfig.data_collection ?? {}) as Record<string, unknown>;
  const missingDcFields = Object.keys(ADVANCE_ORDER_FIELDS).filter((k) => !(k in existing));
  if (missingDcFields.length > 0) {
    console.log('Adding data_collection fields:', missingDcFields);
  } else {
    console.log('✓ data_collection fields already present');
  }
  const mergedDc = { ...existing, ...ADVANCE_ORDER_FIELDS };

  // ── 2. System prompt — ensure CURRENT_TIME_PREFIX is present ────────────────
  const existingPrompt = typeof promptConfig.prompt === 'string' ? promptConfig.prompt : '';
  let newPrompt = existingPrompt;
  if (!existingPrompt.startsWith(CURRENT_TIME_PREFIX)) {
    // Strip any old prefix that starts with "Current time: {{current_time}}" so we don't duplicate
    const stripped = existingPrompt.replace(/^Current time: \{\{current_time\}\}[^\n]*\n\n(?:When capturing pickup_time[^\n]*\n\n)?/, '');
    newPrompt = CURRENT_TIME_PREFIX + stripped;
    console.log('Updating system prompt prefix with current_time + pickup_time instruction');
  } else {
    console.log('✓ System prompt prefix already up to date');
  }

  // ── 3. Initiation webhook ─────────────────────────────────────────────────
  const existingWebhook = (conversationConfig.conversation_initiation_client_data_webhook ?? {}) as Record<string, unknown>;
  const webhookAlreadySet = existingWebhook.url === INITIATION_WEBHOOK_URL;
  if (!webhookAlreadySet) {
    console.log('Setting initiation webhook:', INITIATION_WEBHOOK_URL);
  } else {
    console.log('✓ Initiation webhook already set');
  }

  if (missingDcFields.length === 0 && !webhookAlreadySet === false && newPrompt === existingPrompt) {
    console.log('\n✅ Agent already fully configured — no update needed.');
    return;
  }

  const patch = {
    conversation_config: {
      ...conversationConfig,
      data_collection: mergedDc,
      conversation_initiation_client_data_webhook: {
        ...existingWebhook,
        url: INITIATION_WEBHOOK_URL
      },
      agent: {
        ...agentConfig,
        prompt: {
          ...promptConfig,
          prompt: newPrompt
        }
      }
    }
  };

  await patchAgent(patch);
  console.log('\n✅ ElevenLabs agent updated successfully.');
  console.log(`   Webhook: POST ${INITIATION_WEBHOOK_URL}`);
  console.log('   Dynamic variable {{current_time}} will be injected at call start (Pacific time).');
}

main().catch((err) => {
  console.error('❌ Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
