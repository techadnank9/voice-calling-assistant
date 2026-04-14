import { createHmac, timingSafeEqual } from 'node:crypto';

export type ElevenLabsWebhookType =
  | 'post_call_transcription'
  | 'post_call_audio'
  | 'call_initiation_failure';

export type ElevenLabsTranscriptTurn = {
  role?: string | null;
  message?: string | null;
};

export type ElevenLabsWebhookEvent = {
  type?: ElevenLabsWebhookType | string;
  event_timestamp?: number;
  data?: {
    agent_id?: string;
    conversation_id?: string;
    status?: string;
    transcript?: ElevenLabsTranscriptTurn[];
    analysis?: {
      transcript_summary?: string | null;
      call_successful?: string | null;
    } | null;
    metadata?: {
      start_time_unix_secs?: number;
      call_duration_secs?: number;
      termination_reason?: string | null;
      phone_call?: {
        from_number?: string | null;
        to_number?: string | null;
      } | null;
    } | null;
  } | null;
};

export function parseElevenLabsSignatureHeader(signatureHeader: string | undefined | null) {
  if (!signatureHeader) return null;
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signature = parts.find((part) => part.startsWith('v0='))?.slice(3);
  if (!timestamp || !signature) return null;
  return { timestamp, signature };
}

export function verifyElevenLabsSignature(params: {
  rawBody: string;
  signatureHeader: string | undefined | null;
  secret: string;
  toleranceMs?: number;
  nowMs?: number;
}) {
  const parsed = parseElevenLabsSignatureHeader(params.signatureHeader);
  if (!parsed) return false;

  const timestampMs = Number(parsed.timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) return false;

  const toleranceMs = params.toleranceMs ?? 5 * 60_000;
  const nowMs = params.nowMs ?? Date.now();
  if (Math.abs(nowMs - timestampMs) > toleranceMs) return false;

  const expected = createHmac('sha256', params.secret)
    .update(`${parsed.timestamp}.${params.rawBody}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(parsed.signature, 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function mapElevenLabsTranscriptToMessages(turns: ElevenLabsTranscriptTurn[] | undefined | null) {
  return (turns ?? [])
    .map((turn) => {
      const role = turn.role === 'user' ? 'user' : turn.role === 'agent' ? 'assistant' : null;
      const text = turn.message?.trim() ?? '';
      if (!role || !text) return null;
      return { role, text };
    })
    .filter((value): value is { role: 'user' | 'assistant'; text: string } => Boolean(value));
}

export function matchesConfiguredElevenLabsAgent(
  event: ElevenLabsWebhookEvent,
  configuredAgentId: string | undefined | null
) {
  const expected = configuredAgentId?.trim();
  if (!expected) return true;

  const actual = event.data?.agent_id?.trim();
  return !actual || actual === expected;
}

export function getElevenLabsCallStatus(event: ElevenLabsWebhookEvent) {
  if (event.type === 'call_initiation_failure') return 'failed';
  if (event.data?.status === 'done') return 'completed';
  return 'completed';
}
