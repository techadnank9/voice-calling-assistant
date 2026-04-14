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
  verifyElevenLabsSignature,
  type ElevenLabsWebhookEvent
} from './elevenlabs.js';
import { env } from './config.js';
import { DeepgramCallSession } from './deepgramSession.js';
import { logger } from './logger.js';
import {
  insertEvent,
  persistFallbackOrderAndReservationFromCall,
  reconcileStaleInProgressCalls,
  replaceMessages,
  upsertCall,
  notifyUserActivity,
  closeCall
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

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'voice-calling-assistant-backend' });
});

app.post('/elevenlabs/voice', async (req, res) => {
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});

  if (env.ELEVENLABS_WEBHOOK_SECRET) {
    const isValid = verifyElevenLabsSignature({
      rawBody,
      signatureHeader: req.header('elevenlabs-signature'),
      secret: env.ELEVENLABS_WEBHOOK_SECRET
    });

    if (!isValid) {
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

    await persistFallbackOrderAndReservationFromCall(conversationId).catch((error) =>
      logger.error({ error, conversationId }, 'Failed to persist ElevenLabs fallback order/reservation')
    );
    await closeCall({
      twilioCallSid: conversationId,
      reason: 'order_completed',
      summary: 'Thanks for calling New Delhi Restaurant! Your order is confirmed.'
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
