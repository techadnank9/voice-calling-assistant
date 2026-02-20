import WebSocket from 'ws';
import { z } from 'zod';
import { env } from './config.js';
import { logger } from './logger.js';
import { buildMenuGuardPrompt, createOrder, createReservation, insertEvent, insertMessage } from './supabase.js';

type TwilioMediaPayload = {
  event?: string;
  media?: { payload?: string };
};

type DeepgramEvent = {
  type?: string;
  event?: string;
  [key: string]: unknown;
};

const orderToolSchema = z.object({
  caller_phone: z.string().optional(),
  customer_name: z.string().min(1),
  pickup_time: z.string().optional(),
  notes: z.string().optional(),
  total_cents: z.number().int().nonnegative().optional(),
  items: z
    .array(
      z.object({
        menu_item_id: z.string().optional(),
        qty: z.number().int().positive().optional(),
        modifiers: z.array(z.unknown()).optional(),
        line_total_cents: z.number().int().nonnegative().optional()
      })
    )
    .optional()
});

const reservationToolSchema = z.object({
  caller_phone: z.string().optional(),
  guest_name: z.string().min(1),
  party_size: z.number().int().positive().optional(),
  reservation_time: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['confirmed', 'escalated']).optional()
});

export class DeepgramCallSession {
  private readonly twilioWs: WebSocket;
  private readonly twilioCallSid: string;
  private readonly streamSid: string;
  private deepgramWs: WebSocket | null = null;
  private deepgramReady = false;
  private settingsSent = false;
  private transcriptTurns = 0;
  private pendingAudioChunks: Buffer[] = [];

  constructor(params: { twilioWs: WebSocket; twilioCallSid: string; streamSid: string }) {
    this.twilioWs = params.twilioWs;
    this.twilioCallSid = params.twilioCallSid;
    this.streamSid = params.streamSid;
  }

  connect() {
    this.deepgramWs = new WebSocket(env.DEEPGRAM_AGENT_WS_URL, ['token', env.DEEPGRAM_API_KEY]);

    this.deepgramWs.on('open', () => {
      logger.info({ callSid: this.twilioCallSid, streamSid: this.streamSid }, 'Deepgram websocket opened');
    });

    this.deepgramWs.on('message', async (raw, isBinary) => {
      if (isBinary) {
        const payload = Buffer.from(raw as Buffer).toString('base64');
        this.twilioWs.send(
          JSON.stringify({
            event: 'media',
            streamSid: this.streamSid,
            media: { payload }
          })
        );
        return;
      }

      const text = raw.toString();
      let evt: DeepgramEvent;
      try {
        evt = JSON.parse(text) as DeepgramEvent;
      } catch {
        logger.debug({ callSid: this.twilioCallSid, text }, 'Non-JSON Deepgram message');
        return;
      }

      const kind = String(evt.type ?? evt.event ?? 'unknown');

      if (kind === 'Welcome') {
        this.deepgramReady = false;
        const menuPrompt = await buildMenuGuardPrompt().catch(() => 'Menu unavailable.');
        const stylePrompt = [
          'You are a live phone host for New Delhi Restaurant.',
          'Speak naturally, briefly, and politely. One question at a time.',
          'Never repeat the same sentence unless the caller asks.',
          'Call flow rules:',
          '1) Start with greeting only.',
          '2) Listen to customer intent first (order or reservation).',
          '3) If customer name is unknown, your next question MUST ask their name before any other details.',
          '4) Confirm the name exactly and use it in later responses.',
          'Order rules:',
          '- Only accept items from the provided menu list.',
          '- If an item is not on menu, decline politely and suggest nearby menu options.',
          '- Default pickup time is 20 minutes from now unless customer asks for a different time.',
          '- Before finalizing, confirm items, quantity, pickup time, and customer name.',
          'Reservation rules:',
          '- Must collect and confirm: guest full name, reservation date, reservation time, party size, and occasion.',
          '- If any of these is missing, ask only for the missing field next.',
          'Behavior rules:',
          '- If caller only says thanks/bye and gives no order/reservation, respond politely and close.',
          '- Do not invent menu items, prices, or reservation details.'
        ].join(' ');
        const settingsPayload = {
          type: 'Settings',
          audio: {
            input: {
              encoding: 'mulaw',
              sample_rate: 8000
            },
            output: {
              encoding: 'mulaw',
              sample_rate: 8000,
              container: 'none'
            }
          },
          agent: {
            language: 'en',
            listen: {
              provider: {
                type: 'deepgram',
                model: 'nova-3',
                smart_format: true
              }
            },
            think: {
              provider: {
                type: 'open_ai',
                model: 'gpt-4o'
              },
              prompt: `${stylePrompt}\n\n${menuPrompt}`
            },
            speak: { provider: { type: 'deepgram', model: 'aura-2-thalia-en' } },
            greeting: 'Hello, thanks for calling New Delhi Restaurant.'
          }
        };
        logger.info(
          {
            callSid: this.twilioCallSid,
            thinkProvider: 'open_ai',
            thinkModel: 'gpt-4o',
            listenModel: 'nova-3',
            voiceModel: 'aura-2-thalia-en'
          },
          'Deepgram welcome received, sending settings'
        );
        this.sendDeepgram(settingsPayload);
        this.settingsSent = true;
      }

      if (kind === 'SettingsApplied') {
        logger.info({ callSid: this.twilioCallSid }, 'Deepgram settings applied');
        this.deepgramReady = true;
        if (this.pendingAudioChunks.length > 0 && this.deepgramWs?.readyState === WebSocket.OPEN) {
          for (const chunk of this.pendingAudioChunks) {
            this.deepgramWs.send(chunk);
          }
          logger.info(
            { callSid: this.twilioCallSid, bufferedChunks: this.pendingAudioChunks.length },
            'Flushed buffered audio after settings applied'
          );
          this.pendingAudioChunks = [];
        }
      }

      if (kind === 'Error' || kind === 'Warning') {
        logger.error(
          {
            callSid: this.twilioCallSid,
            deepgramEvent: kind,
            payload: evt
          },
          'Deepgram signaled an issue'
        );
      }

      if (kind === 'UserStartedSpeaking') {
        logger.info({ callSid: this.twilioCallSid }, 'User started speaking (barge-in)');
        this.twilioWs.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
      }

      const transcript = this.extractTranscript(evt);
      const lowerKind = kind.toLowerCase();
      const isLifecycleEvent =
        lowerKind === 'welcome' ||
        lowerKind === 'settingsapplied' ||
        lowerKind === 'metadata' ||
        lowerKind === 'keepalive' ||
        lowerKind === 'userstartedspeaking' ||
        lowerKind === 'agentaudiodone' ||
        lowerKind === 'agentstartedspeaking' ||
        lowerKind === 'agentthinking' ||
        lowerKind === 'error' ||
        lowerKind === 'warning';

      if (transcript && !isLifecycleEvent) {
        const inferredRole = this.inferRole(evt, kind);
        this.transcriptTurns += 1;
        logger.info(
          {
            callSid: this.twilioCallSid,
            turn: this.transcriptTurns,
            deepgramEvent: kind,
            role: inferredRole,
            text: transcript.slice(0, 500)
          },
          'Conversation transcript'
        );
        await insertMessage({
          twilioCallSid: this.twilioCallSid,
          role: inferredRole,
          text: transcript
        })
          .then(() =>
            logger.info(
              {
                callSid: this.twilioCallSid,
                deepgramEvent: kind,
                role: inferredRole,
                transcriptLength: transcript.length
              },
              'Transcript persisted'
            )
          )
          .catch((err) =>
            logger.warn(
              { err, callSid: this.twilioCallSid, deepgramEvent: kind },
              'Failed to write transcript'
            )
          );
      } else if (!isLifecycleEvent) {
        logger.debug(
          {
            callSid: this.twilioCallSid,
            deepgramEvent: kind,
            hasText: Boolean(transcript),
            keys: Object.keys(evt).slice(0, 20)
          },
          'No transcript extracted from non-lifecycle event'
        );
      }

      if (kind.toLowerCase().includes('tool') || kind === 'FunctionCallRequest') {
        await this.handleToolEvent(evt);
      }

      await insertEvent({
        twilioCallSid: this.twilioCallSid,
        eventType: `deepgram.${kind}`,
        payload: evt as Record<string, unknown>
      }).catch(() => undefined);

      logger.debug(
        {
          callSid: this.twilioCallSid,
          deepgramEvent: kind,
          keys: Object.keys(evt).slice(0, 20)
        },
        'Deepgram event processed'
      );
    });

    this.deepgramWs.on('close', (code, reason) => {
      logger.warn(
        {
          callSid: this.twilioCallSid,
          code,
          reason: reason.toString('utf8'),
          totalTurns: this.transcriptTurns
        },
        'Deepgram session closed'
      );
    });

    this.deepgramWs.on('error', (error) => {
      logger.error({ error, callSid: this.twilioCallSid }, 'Deepgram websocket error');
    });
  }

  handleTwilioEvent(event: TwilioMediaPayload) {
    if (!this.deepgramWs || this.deepgramWs.readyState !== WebSocket.OPEN) return;

    if (event.event === 'media' && event.media?.payload) {
      const chunk = Buffer.from(event.media.payload, 'base64');
      if (!this.settingsSent || !this.deepgramReady) {
        if (this.pendingAudioChunks.length < 256) {
          this.pendingAudioChunks.push(chunk);
        }
        return;
      }
      this.deepgramWs.send(chunk);
      return;
    }

    if (event.event === 'stop') {
      logger.info({ callSid: this.twilioCallSid, totalTurns: this.transcriptTurns }, 'Twilio stop received');
      this.sendDeepgram({ type: 'Close' });
      this.deepgramWs.close();
    }
  }

  close() {
    if (this.deepgramWs && this.deepgramWs.readyState === WebSocket.OPEN) {
      this.sendDeepgram({ type: 'Close' });
      this.deepgramWs.close();
    }
  }

  private sendDeepgram(payload: Record<string, unknown>) {
    if (!this.deepgramWs || this.deepgramWs.readyState !== WebSocket.OPEN) return;
    this.deepgramWs.send(JSON.stringify(payload));
  }

  private extractTranscript(evt: DeepgramEvent): string | null {
    const message = (evt as { message?: unknown }).message;
    const messageText =
      typeof message === 'string'
        ? message
        : (message as { content?: unknown; text?: unknown } | undefined)?.content ??
          (message as { content?: unknown; text?: unknown } | undefined)?.text;
    const candidates = [
      (evt as { text?: string }).text,
      (evt as { transcript?: string }).transcript,
      typeof messageText === 'string' ? messageText : undefined,
      (evt as { content?: string }).content,
      (evt as { response?: string }).response
    ];
    return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null;
  }

  private inferRole(evt: DeepgramEvent, kind: string): 'user' | 'assistant' | 'system' {
    const role = (evt as { role?: string }).role?.toLowerCase();
    if (role === 'assistant' || role === 'agent') return 'assistant';
    if (role === 'user' || role === 'caller' || role === 'customer') return 'user';

    const lowered = kind.toLowerCase();
    if (lowered.includes('assistant') || lowered.includes('agent')) return 'assistant';
    if (lowered.includes('user') || lowered.includes('caller')) return 'user';
    return 'system';
  }

  private async handleToolEvent(evt: DeepgramEvent) {
    const name =
      (evt as { name?: string }).name ??
      ((evt as { function_name?: string }).function_name ??
        (evt as { tool_name?: string }).tool_name ??
        ((evt.tool as { name?: string } | undefined)?.name ?? undefined));
    const args =
      (evt as { arguments?: Record<string, unknown> }).arguments ??
      ((evt as { input?: Record<string, unknown> }).input ??
        ((evt.tool as { arguments?: Record<string, unknown> } | undefined)?.arguments ?? {}));

    if (name === 'create_order') {
      const parsed = orderToolSchema.safeParse(args);
      if (!parsed.success) {
        logger.warn(
          { callSid: this.twilioCallSid, issues: parsed.error.issues, rawArgs: args },
          'Invalid create_order tool payload'
        );
        return;
      }
      const payload = parsed.data;
      const tag = `[auto:${this.twilioCallSid}]`;
      const normalizedItems = (payload.items ?? []).map((item) => ({
        menuItemId: item.menu_item_id,
        qty: item.qty ?? 1,
        modifierJson: item.modifiers ?? [],
        lineTotalCents: item.line_total_cents
      }));
      const structuredOutput = {
        schema_version: '1.0',
        source: 'model_tool',
        tool_name: 'create_order',
        twilio_call_sid: this.twilioCallSid,
        customer: {
          name: payload.customer_name,
          caller_phone: payload.caller_phone ?? null
        },
        order: {
          pickup_time: payload.pickup_time ?? '20 minutes',
          total_cents: payload.total_cents ?? 0,
          items: normalizedItems
        }
      };
      await insertEvent({
        twilioCallSid: this.twilioCallSid,
        eventType: 'structured_output',
        payload: structuredOutput as Record<string, unknown>
      }).catch(() => undefined);

      await createOrder({
        callerPhone: payload.caller_phone ?? undefined,
        customerName: payload.customer_name,
        pickupTime: payload.pickup_time ?? '20 minutes',
        notes: `${payload.notes ?? ''} ${tag}`.trim(),
        totalCents: payload.total_cents,
        items: normalizedItems
      }).catch((err) => logger.error({ err, callSid: this.twilioCallSid }, 'Failed to persist order'));
    }

    if (name === 'create_reservation') {
      const parsed = reservationToolSchema.safeParse(args);
      if (!parsed.success) {
        logger.warn(
          { callSid: this.twilioCallSid, issues: parsed.error.issues, rawArgs: args },
          'Invalid create_reservation tool payload'
        );
        return;
      }
      const payload = parsed.data;
      const tag = `[auto:${this.twilioCallSid}]`;
      const structuredOutput = {
        schema_version: '1.0',
        source: 'model_tool',
        tool_name: 'create_reservation',
        twilio_call_sid: this.twilioCallSid,
        customer: {
          name: payload.guest_name,
          caller_phone: payload.caller_phone ?? null
        },
        reservation: {
          party_size: payload.party_size ?? 2,
          reservation_time: payload.reservation_time ?? 'ASAP',
          status: payload.status ?? 'confirmed'
        }
      };
      await insertEvent({
        twilioCallSid: this.twilioCallSid,
        eventType: 'structured_output',
        payload: structuredOutput as Record<string, unknown>
      }).catch(() => undefined);

      await createReservation({
        callerPhone: payload.caller_phone ?? undefined,
        guestName: payload.guest_name,
        partySize: payload.party_size ?? 2,
        reservationTime: payload.reservation_time ?? 'ASAP',
        notes: `${payload.notes ?? ''} ${tag}`.trim(),
        status: payload.status ?? 'confirmed'
      }).catch((err) => logger.error({ err, callSid: this.twilioCallSid }, 'Failed to persist reservation'));
    }
  }
}
