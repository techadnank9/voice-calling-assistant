import http from 'node:http';
import express, { type Request, type Response } from 'express';
import pinoHttp from 'pino-http';
import { WebSocketServer } from 'ws';
import twilio from 'twilio';
import { env } from './config.js';
import { DeepgramCallSession } from './deepgramSession.js';
import { logger } from './logger.js';
import { insertEvent, persistFallbackOrderAndReservationFromCall, reconcileStaleInProgressCalls, upsertCall } from './supabase.js';

const app = express();
app.use(pinoHttp.default({ logger }));
app.use(express.json());
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

app.post('/twilio/voice', twilioWebhookValidator, async (req, res) => {
  const callSid = String(req.body.CallSid ?? '');
  const from = String(req.body.From ?? '');
  const to = String(req.body.To ?? '');
  logger.info({ callSid, from, to }, 'Inbound call webhook received');

  if (callSid) {
    await upsertCall({
      twilioCallSid: callSid,
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
