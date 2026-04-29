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
      /** ElevenLabs sends data_collection_results (not data_collection) */
      data_collection_results?: Record<string, { value: unknown; rationale?: string | null }> | null;
      data_collection?: Record<string, { value: unknown; rationale?: string | null }> | null;
    } | null;
    metadata?: {
      start_time_unix_secs?: number;
      call_duration_secs?: number;
      termination_reason?: string | null;
      /** Phone call metadata — field names vary across ElevenLabs API versions */
      phone_call?: {
        from_number?: string | null;
        to_number?: string | null;
        caller_number?: string | null;
        called_number?: string | null;
        external_number?: string | null;  // ElevenLabs Twilio integration: caller's number
        agent_number?: string | null;     // ElevenLabs Twilio integration: restaurant's number
        [key: string]: string | null | undefined;
      } | null;
    } | null;
    /** Some ElevenLabs versions put phone_call at the data level, not under metadata */
    phone_call?: {
      from_number?: string | null;
      to_number?: string | null;
      caller_number?: string | null;
      called_number?: string | null;
      external_number?: string | null;
      agent_number?: string | null;
      [key: string]: string | null | undefined;
    } | null;
  } | null;
};

/**
 * Extract the caller's phone number from an ElevenLabs webhook event.
 * ElevenLabs uses different field names across API versions/integrations.
 * Checks every known location and returns the first non-empty value.
 */
export function extractElevenLabsCallerNumber(event: ElevenLabsWebhookEvent): string {
  const pc1 = event.data?.metadata?.phone_call;
  const pc2 = event.data?.phone_call;
  return (
    pc1?.external_number ||
    pc1?.from_number     ||
    pc1?.caller_number   ||
    pc2?.external_number ||
    pc2?.from_number     ||
    pc2?.caller_number   ||
    ''
  ).trim();
}

/**
 * Extract the receiver/destination number from an ElevenLabs webhook event.
 */
export function extractElevenLabsReceiverNumber(event: ElevenLabsWebhookEvent): string {
  const pc1 = event.data?.metadata?.phone_call;
  const pc2 = event.data?.phone_call;
  return (
    pc1?.to_number      ||
    pc1?.called_number  ||
    pc2?.to_number      ||
    pc2?.called_number  ||
    ''
  ).trim();
}

export function parseElevenLabsSignatureHeader(signatureHeader: string | undefined | null) {
  if (!signatureHeader) return null;
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signature = parts.find((part) => part.startsWith('v0='))?.slice(3);
  if (!timestamp || !signature) return null;
  return { timestamp, signature };
}

export type VerifyResult = {
  ok: boolean;
  reason?: 'no_signature' | 'bad_timestamp' | 'stale' | 'mismatch';
  diagnostics?: {
    receivedSignature: string;
    timestamp: string;
    rawBodyLen: number;
    secretLen: number;
    candidates: Array<{ source: string; keyLen: number; computed: string }>;
  };
};

export function verifyElevenLabsSignature(params: {
  rawBody: string;
  signatureHeader: string | undefined | null;
  secret: string;
  toleranceMs?: number;
  nowMs?: number;
}): boolean {
  return verifyElevenLabsSignatureDetailed(params).ok;
}

export function verifyElevenLabsSignatureDetailed(params: {
  rawBody: string;
  signatureHeader: string | undefined | null;
  secret: string;
  toleranceMs?: number;
  nowMs?: number;
}): VerifyResult {
  const parsed = parseElevenLabsSignatureHeader(params.signatureHeader);
  if (!parsed) return { ok: false, reason: 'no_signature' };

  const timestampMs = Number(parsed.timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) return { ok: false, reason: 'bad_timestamp' };

  const toleranceMs = params.toleranceMs ?? 5 * 60_000;
  const nowMs = params.nowMs ?? Date.now();
  if (Math.abs(nowMs - timestampMs) > toleranceMs) return { ok: false, reason: 'stale' };

  const payload = `${parsed.timestamp}.${params.rawBody}`;
  const candidates: Array<{ source: string; key: Buffer }> = [];
  if (params.secret.startsWith('wsec_')) {
    const body = params.secret.slice('wsec_'.length);
    candidates.push({ source: 'stripped_utf8', key: Buffer.from(body, 'utf8') });
    if (/^[0-9a-fA-F]+$/.test(body) && body.length % 2 === 0) {
      candidates.push({ source: 'stripped_hex', key: Buffer.from(body, 'hex') });
    }
    try {
      candidates.push({ source: 'stripped_base64', key: Buffer.from(body, 'base64') });
    } catch {
      // ignore
    }
  }
  candidates.push({ source: 'full_utf8', key: Buffer.from(params.secret, 'utf8') });

  const receivedBuffer = Buffer.from(parsed.signature, 'utf8');
  const tried: Array<{ source: string; keyLen: number; computed: string }> = [];
  for (const c of candidates) {
    const computed = createHmac('sha256', c.key).update(payload).digest('hex');
    tried.push({ source: c.source, keyLen: c.key.length, computed });
    const expectedBuffer = Buffer.from(computed, 'utf8');
    if (expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)) {
      return { ok: true };
    }
  }
  return {
    ok: false,
    reason: 'mismatch',
    diagnostics: {
      receivedSignature: parsed.signature,
      timestamp: parsed.timestamp,
      rawBodyLen: params.rawBody.length,
      secretLen: params.secret.length,
      candidates: tried
    }
  };
}

export function mapElevenLabsTranscriptToMessages(turns: ElevenLabsTranscriptTurn[] | undefined | null) {
  const baseMs = Date.now();
  return (turns ?? [])
    .map((turn) => {
      const role = turn.role === 'user' ? 'user' : turn.role === 'agent' ? 'assistant' : null;
      const text = turn.message?.trim() ?? '';
      if (!role || !text) return null;
      return { role, text };
    })
    .filter((value): value is { role: 'user' | 'assistant'; text: string } => Boolean(value))
    .map((message, index) => ({
      ...message,
      createdAt: new Date(baseMs + index).toISOString()
    }));
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
