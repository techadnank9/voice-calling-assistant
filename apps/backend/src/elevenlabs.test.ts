import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  mapElevenLabsTranscriptToMessages,
  matchesConfiguredElevenLabsAgent,
  parseElevenLabsSignatureHeader,
  verifyElevenLabsSignature
} from './elevenlabs.js';

test('parseElevenLabsSignatureHeader extracts timestamp and signature', () => {
  assert.deepEqual(parseElevenLabsSignatureHeader('t=123,v0=abc'), {
    timestamp: '123',
    signature: 'abc'
  });
});

test('verifyElevenLabsSignature accepts valid hmac payloads', () => {
  const rawBody = JSON.stringify({ hello: 'world' });
  const timestamp = '1700000000';
  const secret = 'top-secret';
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

  assert.equal(
    verifyElevenLabsSignature({
      rawBody,
      signatureHeader: `t=${timestamp},v0=${signature}`,
      secret,
      nowMs: Number(timestamp) * 1000
    }),
    true
  );
});

test('mapElevenLabsTranscriptToMessages normalizes agent and user roles', () => {
  const messages = mapElevenLabsTranscriptToMessages([
      { role: 'agent', message: 'Hello there' },
      { role: 'user', message: 'I want butter chicken' },
      { role: 'system', message: 'ignored' }
    ]);

  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.role, 'assistant');
  assert.equal(messages[0]?.text, 'Hello there');
  assert.equal(messages[1]?.role, 'user');
  assert.equal(messages[1]?.text, 'I want butter chicken');
  assert.ok(messages[0]?.createdAt);
  assert.ok(messages[1]?.createdAt);
});

test('matchesConfiguredElevenLabsAgent allows matching and missing agent ids', () => {
  assert.equal(
    matchesConfiguredElevenLabsAgent(
      { data: { agent_id: 'agent_9601kp4h9fsbf5q82nge5ztwjaen' } },
      'agent_9601kp4h9fsbf5q82nge5ztwjaen'
    ),
    true
  );
  assert.equal(matchesConfiguredElevenLabsAgent({ data: {} }, 'agent_9601kp4h9fsbf5q82nge5ztwjaen'), true);
  assert.equal(
    matchesConfiguredElevenLabsAgent(
      { data: { agent_id: 'agent_other' } },
      'agent_9601kp4h9fsbf5q82nge5ztwjaen'
    ),
    false
  );
});
