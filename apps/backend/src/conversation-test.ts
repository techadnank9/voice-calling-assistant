/**
 * Automated conversation test runner.
 * Connects to the ElevenLabs agent via WebSocket (text-only, no audio),
 * plays a scripted ordering scenario, and returns a pass/fail result.
 *
 * Used by POST /admin/run-test — called by scheduled jobs at 9 AM, 10 AM, 1 PM PT.
 */

import WebSocket from 'ws';
import { env } from './config.js';
import { logger } from './logger.js';

/** Scripted user lines sent one after each agent response. */
const ORDER_SCRIPT: string[] = [
  "Hi, I'd like to place an order.",
  'One Chicken Dum Biryani please.',
  "That's all.",
  'No food allergies.',
  'Test User',   // name
  'Yes',         // confirm phone
  'Yes'          // confirm readback / order
];

export type TestResult = {
  passed: boolean;
  durationMs: number;
  transcript: string[];
  conversationId?: string;
  error?: string;
};

export async function runConversationTest(options?: {
  /** Override current time string injected into the agent (e.g. "9:00 AM"). Defaults to real PT time. */
  overrideTime?: string;
  /** Override caller phone injected as dynamic var. Defaults to test number. */
  callerPhone?: string;
  /** Milliseconds to wait for conversation_ended before timing out. Default 120 000. */
  timeoutMs?: number;
}): Promise<TestResult> {
  const agentId = env.ELEVENLABS_AGENT_ID;
  const apiKey = env.ELEVENLABS_API_KEY;

  if (!agentId || !apiKey) {
    return {
      passed: false,
      durationMs: 0,
      transcript: [],
      error: 'Missing ELEVENLABS_AGENT_ID or ELEVENLABS_API_KEY'
    };
  }

  const startMs = Date.now();
  const callerPhone = options?.callerPhone ?? '+15550001234';
  const timeoutMs = options?.timeoutMs ?? 120_000;

  return new Promise<TestResult>((resolve) => {
    const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;
    const ws = new WebSocket(wsUrl, { headers: { 'xi-api-key': apiKey } });

    const transcript: string[] = [];
    let scriptIdx = 0;
    let conversationId: string | undefined;
    let settled = false;

    const finish = (passed: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve({ passed, durationMs: Date.now() - startMs, transcript, conversationId, error });
    };

    const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);

    ws.on('open', () => {
      const now =
        options?.overrideTime ??
        new Date().toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

      ws.send(
        JSON.stringify({
          type: 'conversation_initiation_client_data',
          dynamic_variables: {
            current_time: now,
            caller_phone_number: callerPhone
          }
        })
      );
    });

    ws.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type as string;

      // Keep connection alive
      if (type === 'ping') {
        const pingEvent = msg.ping_event as { event_id?: number } | undefined;
        ws.send(JSON.stringify({ type: 'pong', event_id: pingEvent?.event_id }));
        return;
      }

      // Capture conversation ID from initiation metadata
      if (type === 'conversation_initiation_metadata') {
        const meta = msg.conversation_initiation_metadata_event as { conversation_id?: string } | undefined;
        conversationId = meta?.conversation_id;
        return;
      }

      // Agent spoke — log and send next scripted line
      if (type === 'agent_response') {
        const text = (msg.agent_response as string | undefined)?.trim();
        if (text) {
          transcript.push(`Agent: ${text}`);
          logger.debug({ text }, '[test] agent response');

          if (scriptIdx < ORDER_SCRIPT.length) {
            const line = ORDER_SCRIPT[scriptIdx++];
            setTimeout(() => {
              if (settled) return;
              transcript.push(`User: ${line}`);
              ws.send(JSON.stringify({ type: 'user_message', user_message: line }));
            }, 1200);
          }
        }
        return;
      }

      // Conversation over
      if (type === 'conversation_ended') {
        finish(true);
        return;
      }
    });

    ws.on('error', (err: Error) => finish(false, err.message));
    ws.on('close', () => finish(true));
  });
}
