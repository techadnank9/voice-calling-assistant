import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import pinoHttp from 'pino-http';
import { WebSocketServer } from 'ws';
import twilio from 'twilio';
import {
  getElevenLabsCallStatus,
  mapElevenLabsTranscriptToMessages,
  matchesConfiguredElevenLabsAgent,
  verifyElevenLabsSignatureDetailed,
  type ElevenLabsWebhookEvent
} from './elevenlabs.js';
import { env, missingVars } from './config.js';
import { DeepgramCallSession } from './deepgramSession.js';
import { logger } from './logger.js';
import {
  insertEvent,
  persistFallbackOrderAndReservationFromCall,
  reconcileStaleInProgressCalls,
  replaceMessages,
  upsertCall,
  notifyUserActivity,
  closeCall,
  supabase
} from './supabase.js';

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

  const from = event.data?.metadata?.phone_call?.from_number ?? '';
  const to = event.data?.metadata?.phone_call?.to_number ?? '';
  const startedAt = event.data?.metadata?.start_time_unix_secs
    ? new Date(event.data.metadata.start_time_unix_secs * 1000).toISOString()
    : new Date().toISOString();
  const endedAt =
    event.data?.metadata?.start_time_unix_secs && event.data?.metadata?.call_duration_secs
      ? new Date((event.data.metadata.start_time_unix_secs + event.data.metadata.call_duration_secs) * 1000).toISOString()
      : new Date().toISOString();

  logger.info({ conversationId, from, to, type: event.type }, 'ElevenLabs webhook received');

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

/** Build the TwiML that connects a call to the AI agent media stream. */
function agentStreamTwiml(): string {
  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  connect.stream({
    url: `${env.APP_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/twilio/media`,
    track: 'inbound_track'
  });
  return twiml.toString();
}

app.post('/twilio/voice', twilioWebhookValidator, async (req, res) => {
  const callSid = String(req.body.CallSid ?? '');
  const from = String(req.body.From ?? '');
  const to = String(req.body.To ?? '');
  logger.info({ callSid, from, to }, 'Inbound call webhook received');

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

  // Check if a real restaurant phone is configured — if so, try it first.
  // Agent picks up only if the restaurant doesn't answer within 5 rings (~25s).
  const { data: settings } = await supabase
    .from('restaurant_settings')
    .select('restaurant_phone')
    .limit(1)
    .maybeSingle()
    .catch(() => ({ data: null }));

  const restaurantPhone = (settings?.restaurant_phone ?? '').trim();

  if (restaurantPhone) {
    logger.info({ callSid, restaurantPhone }, 'Forwarding to restaurant phone first');
    const twiml = new twilio.twiml.VoiceResponse();
    const dial = twiml.dial({
      timeout: 25,          // ~5 rings
      action: `${env.APP_BASE_URL}/twilio/voice/fallback`,
      method: 'POST'
    });
    dial.number(restaurantPhone);
    res.type('text/xml').send(twiml.toString());
  } else {
    logger.info({ callSid }, 'No restaurant phone set — connecting to AI agent directly');
    res.type('text/xml').send(agentStreamTwiml());
  }
});

// Called by Twilio when the restaurant doesn't answer (timeout / busy / no-answer).
app.post('/twilio/voice/fallback', twilioWebhookValidator, (req, res) => {
  const dialStatus = String(req.body.DialCallStatus ?? '');
  const callSid = String(req.body.CallSid ?? '');
  logger.info({ callSid, dialStatus }, 'Restaurant did not answer — handing off to AI agent');
  res.type('text/xml').send(agentStreamTwiml());
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
