import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import pinoHttp from 'pino-http';
import { WebSocketServer } from 'ws';
import twilio from 'twilio';
import {
  extractElevenLabsCallerNumber,
  extractElevenLabsReceiverNumber,
  getElevenLabsCallStatus,
  mapElevenLabsTranscriptToMessages,
  matchesConfiguredElevenLabsAgent,
  verifyElevenLabsSignatureDetailed,
  type ElevenLabsWebhookEvent
} from './elevenlabs.js';
import { env, missingVars } from './config.js';
import { DeepgramCallSession } from './deepgramSession.js';
import { logger } from './logger.js';
import { sendOrderToClover } from './clover.js';
import {
  supabase,
  insertEvent,
  persistFallbackOrderAndReservationFromCall,
  reconcileStaleInProgressCalls,
  replaceMessages,
  upsertCall,
  notifyUserActivity,
  closeCall
} from './supabase.js';
import { runConversationTest } from './conversation-test.js';

const app = express();
app.use(pinoHttp.default({ logger }));
app.use(
  express.json({
    verify: (req, _res, buffer) => {
      (req as Request & { rawBody?: string }).rawBody = buffer.toString('utf8');
    }
  })
);
app.use(express.urlencoded({ extended: false }));

const twilioWebhookValidator = (req: Request, res: Response, next: () => void) => {
  if (!env.TWILIO_AUTH_TOKEN) return next();

  const signature = req.header('x-twilio-signature');
  if (!signature) {
    res.status(403).send('Missing Twilio signature');
    return;
  }

  const url = `${env.APP_BASE_URL}${req.originalUrl}`;
  const isValid = twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body as Record<string, string>
  );

  if (!isValid) {
    res.status(403).send('Invalid Twilio signature');
    return;
  }

  next();
};

const ENV_VARS: { name: string; required: boolean; secret: boolean; description: string }[] = [
  { name: 'APP_BASE_URL',              required: true,  secret: false, description: 'Public URL of this backend service' },
  { name: 'SUPABASE_URL',             required: true,  secret: false, description: 'Supabase project URL' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY',required: true,  secret: true,  description: 'Supabase service role key' },
  { name: 'DEEPGRAM_API_KEY',         required: false, secret: true,  description: 'Deepgram API key (optional — only needed for Deepgram calls)' },
  { name: 'DEEPGRAM_AGENT_WS_URL',    required: false, secret: false, description: 'Deepgram agent WebSocket URL (has default)' },
  { name: 'ELEVENLABS_AGENT_ID',      required: false, secret: false, description: 'ElevenLabs agent ID (optional integration)' },
  { name: 'ELEVENLABS_API_KEY',       required: false, secret: true,  description: 'ElevenLabs API key (optional integration)' },
  { name: 'ELEVENLABS_WEBHOOK_SECRET',required: false, secret: true,  description: 'ElevenLabs webhook signature secret' },
  { name: 'TWILIO_AUTH_TOKEN',        required: false, secret: true,  description: 'Twilio auth token for webhook validation' },
  { name: 'PORT',                     required: false, secret: false, description: 'HTTP port (default: 8080)' },
  { name: 'NODE_ENV',                 required: false, secret: false, description: 'development | production (default: development)' },
  { name: 'LOG_LEVEL',                required: false, secret: false, description: 'Pino log level (default: info)' },
];

const statusHtml = () => {
  const globalOk = missingVars.length === 0;
  const rows = ENV_VARS.map(({ name, required, secret, description }) => {
    const raw = process.env[name];
    const isSet = raw !== undefined && raw !== '';
    const preview = isSet
      ? secret
        ? `<span style="color:#6b7280;font-style:italic">[set — hidden]</span>`
        : `<code style="background:#f3f4f6;padding:1px 6px;border-radius:4px;font-size:12px">${raw}</code>`
      : `<span style="color:#dc2626;font-weight:600">not set</span>`;
    const reqBadge = required
      ? `<span style="background:#fef3c7;color:#92400e;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600">required</span>`
      : `<span style="background:#f3f4f6;color:#6b7280;padding:1px 7px;border-radius:999px;font-size:11px">optional</span>`;
    const rowBg = !isSet && required ? '#fff5f5' : 'transparent';
    const copyBtn = `<button onclick="copyVar('${name}',this)" style="cursor:pointer;border:1px solid #d1d5db;background:#f9fafb;border-radius:5px;padding:3px 5px;line-height:0;color:#6b7280;margin-right:7px;vertical-align:middle" title="Copy variable name"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
    return `<tr style="background:${rowBg}">
      <td style="padding:10px 12px;font-family:monospace;font-size:13px;font-weight:600;white-space:nowrap">${copyBtn}${name}</td>
      <td style="padding:10px 12px">${reqBadge}</td>
      <td style="padding:10px 8px;font-size:12px;color:#6b7280">${description}</td>
      <td style="padding:10px 12px;white-space:nowrap">${preview}</td>
    </tr>`;
  }).join('');

  const statusBadge = globalOk
    ? `<span style="display:inline-block;padding:4px 14px;border-radius:999px;font-size:13px;font-weight:600;background:#d1fae5;color:#065f46">● Running</span>`
    : `<span style="display:inline-block;padding:4px 14px;border-radius:999px;font-size:13px;font-weight:600;background:#fee2e2;color:#991b1b">⚠ Setup Required</span>`;

  const subtitle = globalOk
    ? `<p style="color:#6b7280;margin:8px 0 24px">All required environment variables are set.</p>`
    : `<p style="color:#6b7280;margin:8px 0 24px">Add missing variables in Railway → <strong>Variables</strong> tab, then redeploy.</p>`;

  return `<!DOCTYPE html><html><head><title>Ringo Backend</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;margin:0;padding:40px 20px;background:#f9fafb;color:#111}
  .card{background:#fff;border-radius:12px;border:1px solid #e5e7eb;max-width:900px;margin:0 auto;padding:28px 32px}
  h2{margin:0 0 8px;font-size:22px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  thead th{text-align:left;padding:8px 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb}
  tbody tr{border-bottom:1px solid #f3f4f6}
  tbody tr:last-child{border-bottom:none}
</style>
<script>
var copyIcon='<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
var checkIcon='<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#065f46" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
function copyVar(name,btn){navigator.clipboard.writeText(name).then(()=>{btn.innerHTML=checkIcon;btn.style.borderColor='#6ee7b7';setTimeout(()=>{btn.innerHTML=copyIcon;btn.style.borderColor=''},1500)})}
</script>
</head><body>
<div class="card">
  <h2>◉ Ringo Backend</h2>
  ${statusBadge}
  ${subtitle}
  <table>
    <thead><tr>
      <th>Variable</th><th>Type</th><th>Description</th><th>Value</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
</body></html>`;
};

app.get('/', (_req, res) => {
  const ok = missingVars.length === 0;
  res.status(ok ? 200 : 503).type('text/html').send(statusHtml());
});

app.get('/health', (_req, res) => {
  if (missingVars.length > 0) {
    res.status(503).json({ ok: false, missingVars });
    return;
  }
  res.json({ ok: true, service: 'voice-calling-assistant-backend' });
});

// Scheduled automated conversation test — called by daily cron at 9 AM, 10 AM, 1 PM PT.
app.get('/admin/clover-employees', async (req: Request, res: Response) => {
  const secret = req.header('x-test-secret');
  if (!env.TEST_SECRET || secret !== env.TEST_SECRET) { res.status(401).json({ error: 'unauthorized' }); return; }
  const merchantId = env.CLOVER_BIRYANI_LLC_MERCHANT_ID;
  const apiToken = env.CLOVER_BIRYANI_LLC_API_TOKEN;
  if (!merchantId || !apiToken) { res.status(400).json({ error: 'not_configured' }); return; }
  const r = await fetch(`https://api.clover.com/v3/merchants/${merchantId}/employees`, {
    headers: { Authorization: `Bearer ${apiToken}` }
  });
  res.json(await r.json());
});

app.get('/admin/clover-order-types', async (req: Request, res: Response) => {
  const secret = req.header('x-test-secret');
  if (!env.TEST_SECRET || secret !== env.TEST_SECRET) { res.status(401).json({ error: 'unauthorized' }); return; }
  const merchantId = env.CLOVER_BIRYANI_LLC_MERCHANT_ID;
  const apiToken = env.CLOVER_BIRYANI_LLC_API_TOKEN;
  if (!merchantId || !apiToken) { res.status(400).json({ error: 'not_configured' }); return; }
  const r = await fetch(`https://api.clover.com/v3/merchants/${merchantId}/order_types`, {
    headers: { Authorization: `Bearer ${apiToken}` }
  });
  res.json(await r.json());
});

app.post('/admin/clover-test', async (req: Request, res: Response) => {
  const secret = req.header('x-test-secret');
  if (!env.TEST_SECRET || secret !== env.TEST_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const { item, qty, price } = req.body ?? {};
    const itemName = typeof item === 'string' ? item : 'Chicken Dum Biryani';
    const itemQty = typeof qty === 'number' ? qty : 1;
    const itemPrice = typeof price === 'number' ? price : 1600;
    const totalCents = itemPrice * itemQty;

    // Insert a Supabase order record so it shows on the Clover POS page
    const { data: newOrder } = await supabase.from('orders').insert({
      customer_name: 'Test User',
      caller_phone: '+15550001234',
      pickup_time: '1:20 PM',
      total_cents: totalCents,
      clover_business: 'llc'
    }).select('id').single();

    const result = await sendOrderToClover({
      customerName: 'Test User',
      callerPhone: '+15550001234',
      pickupTime: '1:20 PM',
      totalCents,
      items: [{ name: itemName, qty: itemQty, lineTotalCents: totalCents }]
    });

    // Update order with Clover result
    if (newOrder?.id) {
      if (result.ok) {
        await supabase.from('orders').update({ clover_order_id: result.cloverOrderId, clover_status: 'sent', clover_business: 'llc' }).eq('id', newOrder.id);
      } else {
        await supabase.from('orders').update({ clover_status: 'failed', clover_error: result.error, clover_business: 'llc' }).eq('id', newOrder.id);
      }
    }

    logger.info({ result }, 'Clover test order result');
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/admin/run-test', async (req: Request, res: Response) => {
  const secret = req.header('x-test-secret');
  if (!env.TEST_SECRET || secret !== env.TEST_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const overrideTime = typeof req.body?.override_time === 'string' ? req.body.override_time : undefined;
    const scenario = typeof req.body?.scenario === 'string' ? req.body.scenario : undefined;
    const scheduleId = typeof req.body?.schedule_id === 'string' ? req.body.schedule_id : undefined;

    // Check if this schedule is paused in restaurant_settings
    if (scheduleId) {
      const { data: settings } = await supabase
        .from('restaurant_settings')
        .select('test_schedule_config')
        .limit(1)
        .maybeSingle();
      const config = (settings?.test_schedule_config as Record<string, { paused?: boolean }> | null) ?? {};
      if (config[scheduleId]?.paused === true) {
        logger.info({ scheduleId }, 'Test skipped — schedule is paused');
        res.json({ passed: true, skipped: true, durationMs: 0, transcript: [], scheduleId });
        return;
      }
    }

    const result = await runConversationTest({ overrideTime, scenario } as Parameters<typeof runConversationTest>[0]);
    logger.info({ passed: result.passed, durationMs: result.durationMs, conversationId: result.conversationId, error: result.error }, 'Scheduled conversation test completed');
    res.json(result);
  } catch (e) {
    logger.error({ err: e }, 'Conversation test endpoint error');
    res.status(500).json({ error: String(e) });
  }
});

// ElevenLabs calls this at the start of every inbound call to get dynamic variables.
// The agent's system prompt must contain {{current_time}} and {{caller_phone_number}} for substitution to work.
// Phone numbers that should be rejected immediately (spammers / robocallers)
const BLOCKLIST = new Set([
  '+12062024567'
]);

app.post('/elevenlabs/initiation', (req, res) => {
  const now = new Date();
  const currentTime = now.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  // ElevenLabs sends caller info in the request body — log full payload to diagnose field names
  const body = req.body ?? {};
  const query = req.query ?? {};
  logger.info({ initiationBody: body, initiationQuery: query }, 'ElevenLabs initiation webhook received');
  // Try all known field locations: body fields, then query params
  const callerPhone: string = (
    body.caller_id ?? body.from_number ?? body.From ??
    query['caller_id'] ?? query['from_number'] ?? ''
  ).toString().trim();

  const isBlocked = BLOCKLIST.has(callerPhone);
  if (isBlocked) {
    logger.info({ callerPhone }, 'Blocked caller — injecting caller_blocked=true');
  }

  res.json({
    type: 'conversation_initiation_client_data',
    dynamic_variables: {
      current_time: currentTime,
      caller_phone_number: callerPhone,
      caller_blocked: isBlocked ? 'true' : 'false'
    }
  });
});

app.post('/elevenlabs/voice', async (req, res) => {
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});

  if (env.ELEVENLABS_WEBHOOK_SECRET) {
    const result = verifyElevenLabsSignatureDetailed({
      rawBody,
      signatureHeader: req.header('elevenlabs-signature'),
      secret: env.ELEVENLABS_WEBHOOK_SECRET
    });

    if (!result.ok) {
      logger.warn(
        { reason: result.reason, diagnostics: result.diagnostics, sigHeader: req.header('elevenlabs-signature') },
        'ElevenLabs signature verification failed'
      );
      res.status(401).json({ error: 'Invalid ElevenLabs signature' });
      return;
    }
  }

  const event = (req.body ?? {}) as ElevenLabsWebhookEvent;
  if (!matchesConfiguredElevenLabsAgent(event, env.ELEVENLABS_AGENT_ID)) {
    res.status(403).json({ error: 'Unexpected ElevenLabs agent_id' });
    return;
  }

  const conversationId = String(event.data?.conversation_id ?? '');
  if (!conversationId) {
    res.status(400).json({ error: 'Missing conversation_id' });
    return;
  }

  const from = extractElevenLabsCallerNumber(event);
  const to = extractElevenLabsReceiverNumber(event);
  const startedAt = event.data?.metadata?.start_time_unix_secs
    ? new Date(event.data.metadata.start_time_unix_secs * 1000).toISOString()
    : new Date().toISOString();
  const endedAt =
    event.data?.metadata?.start_time_unix_secs && event.data?.metadata?.call_duration_secs
      ? new Date((event.data.metadata.start_time_unix_secs + event.data.metadata.call_duration_secs) * 1000).toISOString()
      : new Date().toISOString();

  // Log raw phone_call metadata so we can diagnose missing caller numbers
  logger.info(
    {
      conversationId,
      from: from || '(empty)',
      to: to || '(empty)',
      type: event.type,
      rawPhoneCallMeta: event.data?.metadata?.phone_call ?? event.data?.phone_call ?? null
    },
    'ElevenLabs webhook received'
  );

  await upsertCall({
    twilioCallSid: conversationId,
    provider: 'elevenlabs',
    fromNumber: from || undefined,
    toNumber: to || undefined,
    status: getElevenLabsCallStatus(event),
    startedAt,
    endedAt
  }).catch((error) => logger.error({ error, conversationId }, 'Failed to upsert ElevenLabs call'));

  await insertEvent({
    twilioCallSid: conversationId,
    provider: 'elevenlabs',
    eventType: `elevenlabs.${event.type ?? 'unknown'}`,
    payload: event as Record<string, unknown>
  }).catch(() => undefined);

  if (event.type === 'post_call_transcription') {
    const transcriptMessages = mapElevenLabsTranscriptToMessages(event.data?.transcript);
    await replaceMessages({
      twilioCallSid: conversationId,
      messages: transcriptMessages
    }).catch((error) => logger.error({ error, conversationId }, 'Failed to replace ElevenLabs transcript turns'));

    if (transcriptMessages.some((msg) => msg.role === 'user')) {
      notifyUserActivity(conversationId);
    }

    const elevenLabsSummary = event.data?.analysis?.transcript_summary ?? null;
    const elevenLabsDC =
      event.data?.analysis?.data_collection_results ??
      event.data?.analysis?.data_collection ??
      null;
    await persistFallbackOrderAndReservationFromCall(conversationId, elevenLabsSummary, elevenLabsDC).catch((error) =>
      logger.error({ error, conversationId }, 'Failed to persist ElevenLabs fallback order/reservation')
    );
    await closeCall({
      twilioCallSid: conversationId,
      reason: 'order_completed',
      summary: "Thanks for calling Mom's Biryani! Your order is confirmed."
    }).catch(() => undefined);
  }

  if (event.type === 'call_initiation_failure') {
    await replaceMessages({
      twilioCallSid: conversationId,
      messages: [
        {
          role: 'system',
          text: `ElevenLabs call initiation failed. Reference ${conversationId || randomUUID()}.`
        }
      ]
    }).catch(() => undefined);
  }

  res.status(200).json({ ok: true });
});

app.post('/twilio/voice', twilioWebhookValidator, async (req, res) => {
  const callSid = String(req.body.CallSid ?? '');
  const from = String(req.body.From ?? '');
  const to = String(req.body.To ?? '');
  logger.info({ callSid, from, to }, 'Inbound call received — connecting to AI agent');

  if (callSid) {
    await upsertCall({
      twilioCallSid: callSid,
      provider: 'deepgram',
      fromNumber: from,
      toNumber: to,
      status: 'in_progress',
      startedAt: new Date().toISOString()
    }).catch((error) => logger.error({ error }, 'Failed to upsert call'));
  }

  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  connect.stream({
    url: `${env.APP_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/twilio/media`,
    track: 'inbound_track'
  });
  res.type('text/xml').send(twiml.toString());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const sessions = new Map<string, DeepgramCallSession>();

server.on('upgrade', (req, socket, head) => {
  const isMediaPath = req.url?.startsWith('/twilio/media');
  if (!isMediaPath) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  let activeCallSid = '';

  ws.on('message', async (raw) => {
    const payload = JSON.parse(raw.toString()) as {
      event?: string;
      start?: { callSid?: string; streamSid?: string };
      media?: { payload?: string };
      stop?: { callSid?: string };
      streamSid?: string;
    };

    if (payload.event === 'start' && payload.start?.callSid && payload.start.streamSid) {
      activeCallSid = payload.start.callSid;
      logger.info(
        {
          callSid: activeCallSid,
          streamSid: payload.start.streamSid
        },
        'Twilio media stream started'
      );
      const session = new DeepgramCallSession({
        twilioWs: ws,
        twilioCallSid: payload.start.callSid,
        streamSid: payload.start.streamSid
      });
      sessions.set(activeCallSid, session);
      session.connect();

      await insertEvent({
        twilioCallSid: activeCallSid,
        provider: 'deepgram',
        eventType: 'twilio.start',
        payload: payload as Record<string, unknown>
      }).catch(() => undefined);

      return;
    }

    if (!activeCallSid) return;
    if (payload.event) {
      logger.debug({ callSid: activeCallSid, twilioEvent: payload.event }, 'Twilio media event');
    }
    if (payload.event) {
      sessions.get(activeCallSid)?.handleTwilioEvent(payload);
    }

    if (payload.event === 'stop') {
      logger.info({ callSid: activeCallSid }, 'Twilio media stream stopped');
      sessions.get(activeCallSid)?.close();
      sessions.delete(activeCallSid);
      await upsertCall({
        twilioCallSid: activeCallSid,
        provider: 'deepgram',
        status: 'completed',
        endedAt: new Date().toISOString()
      }).catch((error) => logger.error({ error }, 'Failed to close call'));
      await persistFallbackOrderAndReservationFromCall(activeCallSid).catch((error) =>
        logger.error({ error, callSid: activeCallSid }, 'Failed to persist fallback order/reservation')
      );
    }
  });

  ws.on('close', async () => {
    if (!activeCallSid) return;
    logger.info({ callSid: activeCallSid }, 'Twilio websocket closed');
    sessions.get(activeCallSid)?.close();
    sessions.delete(activeCallSid);
    await upsertCall({
      twilioCallSid: activeCallSid,
      provider: 'deepgram',
      status: 'completed',
      endedAt: new Date().toISOString()
    }).catch(() => undefined);
    await persistFallbackOrderAndReservationFromCall(activeCallSid).catch((error) =>
      logger.error({ error, callSid: activeCallSid }, 'Failed to persist fallback order/reservation on close')
    );
  });
});

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Backend started');
  reconcileStaleInProgressCalls().catch((error) =>
    logger.error({ error }, 'Failed to reconcile stale in_progress calls at startup')
  );
  setInterval(() => {
    reconcileStaleInProgressCalls().catch((error) =>
      logger.error({ error }, 'Failed to reconcile stale in_progress calls')
    );
  }, 60_000);
});
