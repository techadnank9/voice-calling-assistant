import WebSocket from 'ws';
import { env } from './config.js';
import { logger } from './logger.js';
import { createOrder, createReservation, insertEvent, insertMessage } from './supabase.js';

type TwilioMediaPayload = {
  event?: string;
  sequenceNumber?: string;
  media?: { payload?: string; track?: string; chunk?: string; timestamp?: string };
  start?: { streamSid?: string; callSid?: string };
  stop?: { accountSid?: string; callSid?: string };
  streamSid?: string;
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

  constructor(params: { twilioWs: WebSocket; twilioCallSid: string; streamSid: string }) {
    this.twilioWs = params.twilioWs;
    this.twilioCallSid = params.twilioCallSid;
    this.streamSid = params.streamSid;
  }

  connect() {
    this.deepgramWs = new WebSocket(env.DEEPGRAM_AGENT_WS_URL, {
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`
      }
    });

    this.deepgramWs.on('open', () => {
      logger.info({ callSid: this.twilioCallSid }, 'Deepgram session connected');

      this.sendDeepgram({
        type: 'SettingsConfiguration',
        audio: {
          input: {
            encoding: 'mulaw',
            sample_rate: 8000
          },
          output: {
            encoding: 'mulaw',
            sample_rate: 8000
          }
        },
        agent: {
          language: 'en-US',
          prompt:
            'You are a professional concierge for a restaurant. You can take food pickup orders and table reservations. Always confirm details before finalizing. If a reservation cannot be confirmed, collect callback details and inform a human will follow up.'
        }
      });
    });

    this.deepgramWs.on('message', async (raw) => {
      const text = raw.toString();
      let evt: DeepgramEvent;

      try {
        evt = JSON.parse(text) as DeepgramEvent;
      } catch {
        return;
      }

      const kind = String(evt.type ?? evt.event ?? 'unknown');

      if (kind.toLowerCase().includes('audio')) {
        const audioBase64 = this.extractAudioPayload(evt);
        if (audioBase64) {
          this.twilioWs.send(
            JSON.stringify({
              event: 'media',
              streamSid: this.streamSid,
              media: { payload: audioBase64 }
            })
          );
        }
      }

      if (kind.toLowerCase().includes('transcript')) {
        const transcript = this.extractTranscript(evt);
        if (transcript) {
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
          await insertMessage({
            twilioCallSid: this.twilioCallSid,
            role: 'assistant',
            text: responseText
          }).catch((err) => logger.warn({ err }, 'Failed to write assistant transcript'));
        }
      }

      if (kind.toLowerCase().includes('tool')) {
        await this.handleToolEvent(evt);
      }

      await insertEvent({
        twilioCallSid: this.twilioCallSid,
        eventType: `deepgram.${kind}`,
        payload: evt as Record<string, unknown>
      }).catch(() => undefined);
    });

    this.deepgramWs.on('close', () => {
      logger.info({ callSid: this.twilioCallSid }, 'Deepgram session closed');
    });

    this.deepgramWs.on('error', (error) => {
      logger.error({ error, callSid: this.twilioCallSid }, 'Deepgram websocket error');
    });
  }

  handleTwilioEvent(event: TwilioMediaPayload) {
    if (!this.deepgramWs || this.deepgramWs.readyState !== WebSocket.OPEN) return;

    if (event.event === 'media' && event.media?.payload) {
      this.sendDeepgram({
        type: 'AudioData',
        audio: event.media.payload
      });
      return;
    }

    if (event.event === 'stop') {
      this.sendDeepgram({ type: 'CloseStream' });
      this.deepgramWs.close();
    }
  }

  close() {
    if (this.deepgramWs && this.deepgramWs.readyState === WebSocket.OPEN) {
      this.sendDeepgram({ type: 'CloseStream' });
      this.deepgramWs.close();
    }
  }

  private sendDeepgram(payload: Record<string, unknown>) {
    if (!this.deepgramWs || this.deepgramWs.readyState !== WebSocket.OPEN) return;
    this.deepgramWs.send(JSON.stringify(payload));
  }

  private extractAudioPayload(evt: DeepgramEvent): string | null {
    const candidates = [
      (evt.audio as { data?: string } | undefined)?.data,
      (evt.audio as { payload?: string } | undefined)?.payload,
      (evt as { data?: string }).data
    ];
    return candidates.find((value): value is string => typeof value === 'string') ?? null;
  }

  private extractTranscript(evt: DeepgramEvent): string | null {
    const candidates = [
      (evt as { text?: string }).text,
      (evt as { transcript?: string }).transcript,
      (evt as { message?: string }).message
    ];
    return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null;
  }

  private async handleToolEvent(evt: DeepgramEvent) {
    const name =
      (evt as { name?: string }).name ??
      ((evt.tool as { name?: string } | undefined)?.name ?? (evt as { tool_name?: string }).tool_name);
    const args =
      (evt as { arguments?: Record<string, unknown> }).arguments ??
      ((evt.tool as { arguments?: Record<string, unknown> } | undefined)?.arguments ?? {});

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
