import test from 'node:test';
import assert from 'node:assert/strict';
import { formatConversationProvider, normalizeConversationProvider } from './conversationProvider';

test('normalizeConversationProvider defaults empty values to deepgram', () => {
  assert.equal(normalizeConversationProvider(undefined), 'deepgram');
  assert.equal(normalizeConversationProvider(null), 'deepgram');
});

test('formatConversationProvider returns stable labels', () => {
  assert.equal(formatConversationProvider('deepgram'), 'Deepgram');
  assert.equal(formatConversationProvider('elevenlabs'), 'ElevenLabs');
});
