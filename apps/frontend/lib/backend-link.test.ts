import test from 'node:test';
import assert from 'node:assert/strict';
import { getBackendBaseUrl, getBackendLinkLabel } from './backend-link';

test('getBackendBaseUrl falls back to the hosted Render backend', () => {
  assert.equal(getBackendBaseUrl(), 'https://voice-calling-assistant.onrender.com');
});

test('getBackendBaseUrl prefers a provided public backend URL', () => {
  assert.equal(getBackendBaseUrl('https://example.com'), 'https://example.com');
});

test('getBackendLinkLabel returns the UI label for backend availability links', () => {
  assert.equal(getBackendLinkLabel(), 'Online');
});
