export type ConversationProvider = 'deepgram' | 'elevenlabs';

export function normalizeConversationProvider(value: string | null | undefined): ConversationProvider {
  return value === 'elevenlabs' ? 'elevenlabs' : 'deepgram';
}

export function formatConversationProvider(value: string | null | undefined) {
  return normalizeConversationProvider(value) === 'elevenlabs' ? 'ElevenLabs' : 'Deepgram';
}
