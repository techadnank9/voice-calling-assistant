import test from 'node:test';
import assert from 'node:assert/strict';
import { formatConversationProvider, normalizeConversationProvider } from './callProvider.js';

test('normalizeConversationProvider defaults missing values to deepgram', () => {
  assert.equal(normalizeConversationProvider(undefined), 'deepgram');
  assert.equal(normalizeConversationProvider(null), 'deepgram');
});

test('normalizeConversationProvider accepts elevenlabs and deepgram', () => {
  assert.equal(normalizeConversationProvider('elevenlabs'), 'elevenlabs');
  assert.equal(normalizeConversationProvider('deepgram'), 'deepgram');
});

test('formatConversationProvider returns UI-safe labels', () => {
  assert.equal(formatConversationProvider('deepgram'), 'Deepgram');
  assert.equal(formatConversationProvider('elevenlabs'), 'ElevenLabs');
});
