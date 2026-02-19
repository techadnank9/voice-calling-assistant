import WebSocket from 'ws';
import { env } from './config.js';
import { logger } from './logger.js';
import { createOrder, createReservation, insertEvent, insertMessage } from './supabase.js';

type TwilioMediaPayload = {
  event?: string;
  media?: { payload?: string };
};

type DeepgramEvent = {
  type?: string;
  event?: string;
  [key: string]: unknown;
};

export class DeepgramCallSession {
  private readonly twilioWs: WebSocket;
  private readonly twilioCallSid: string;
  private readonly streamSid: string;
  private deepgramWs: WebSocket | null = null;
  private deepgramReady = false;
  private transcriptTurns = 0;

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
        this.deepgramReady = true;
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
            listen: { provider: { type: 'deepgram' } },
            think: {
              provider: {
                type: 'deepgram',
                model: 'nova-3'
              },
              prompt:
                'You are a professional concierge for a restaurant. You can take food pickup orders and table reservations. Always confirm details before finalizing. If a reservation cannot be confirmed, collect callback details and inform a human will follow up.'
            },
            speak: { provider: { type: 'deepgram', model: 'aura-2-thalia-en' } }
          }
        };
        logger.info(
          {
            callSid: this.twilioCallSid,
            thinkProvider: 'deepgram',
            thinkModel: 'nova-3',
            voiceModel: 'aura-2-thalia-en'
          },
          'Deepgram welcome received, sending settings'
        );
        this.sendDeepgram(settingsPayload);
      }

      if (kind === 'UserStartedSpeaking') {
        logger.info({ callSid: this.twilioCallSid }, 'User started speaking (barge-in)');
        this.twilioWs.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
      }

      if (kind.toLowerCase().includes('transcript')) {
        const transcript = this.extractTranscript(evt);
        if (transcript) {
          this.transcriptTurns += 1;
          logger.info(
            {
              callSid: this.twilioCallSid,
              turn: this.transcriptTurns,
              role: 'user',
              text: transcript.slice(0, 500)
            },
            'Conversation transcript'
          );
          await insertMessage({
            twilioCallSid: this.twilioCallSid,
            role: 'user',
            text: transcript
          }).catch((err) => logger.warn({ err }, 'Failed to write user transcript'));
        }
      }

      if (kind.toLowerCase().includes('response') || kind.toLowerCase().includes('assistant')) {
        const responseText = this.extractTranscript(evt);
        if (responseText) {
          this.transcriptTurns += 1;
          logger.info(
            {
              callSid: this.twilioCallSid,
              turn: this.transcriptTurns,
              role: 'assistant',
              text: responseText.slice(0, 500)
            },
            'Conversation transcript'
          );
          await insertMessage({
            twilioCallSid: this.twilioCallSid,
            role: 'assistant',
            text: responseText
          }).catch((err) => logger.warn({ err }, 'Failed to write assistant transcript'));
        }
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
    if (!this.deepgramWs || this.deepgramWs.readyState !== WebSocket.OPEN || !this.deepgramReady) return;

    if (event.event === 'media' && event.media?.payload) {
      const chunk = Buffer.from(event.media.payload, 'base64');
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
    const candidates = [
      (evt as { text?: string }).text,
      (evt as { transcript?: string }).transcript,
      (evt as { message?: string }).message,
      (evt as { content?: string }).content
    ];
    return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null;
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
      const items = Array.isArray(args.items) ? (args.items as Array<Record<string, unknown>>) : [];
      await createOrder({
        callerPhone: typeof args.caller_phone === 'string' ? args.caller_phone : undefined,
        customerName: String(args.customer_name ?? 'Unknown'),
        pickupTime: String(args.pickup_time ?? ''),
        notes: typeof args.notes === 'string' ? args.notes : undefined,
        totalCents: typeof args.total_cents === 'number' ? args.total_cents : undefined,
        items: items.map((item) => ({
          menuItemId: typeof item.menu_item_id === 'string' ? item.menu_item_id : undefined,
          qty: Number(item.qty ?? 1),
          modifierJson: Array.isArray(item.modifiers) ? (item.modifiers as unknown[]) : [],
          lineTotalCents: typeof item.line_total_cents === 'number' ? item.line_total_cents : undefined
        }))
      }).catch((err) => logger.error({ err }, 'Failed to persist order'));
    }

    if (name === 'create_reservation') {
      await createReservation({
        callerPhone: typeof args.caller_phone === 'string' ? args.caller_phone : undefined,
        guestName: String(args.guest_name ?? 'Unknown'),
        partySize: Number(args.party_size ?? 2),
        reservationTime: String(args.reservation_time ?? ''),
        notes: typeof args.notes === 'string' ? args.notes : undefined,
        status: args.status === 'escalated' ? 'escalated' : 'confirmed'
      }).catch((err) => logger.error({ err }, 'Failed to persist reservation'));
    }
  }
}
