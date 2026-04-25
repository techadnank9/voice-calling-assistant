import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractConfirmedMenuItems,
  extractCustomerName,
  extractFinalReadbackSection,
  extractTotalCentsFromAssistantTranscript
} from './orderExtraction.js';

test('extractCustomerName handles split my-name phrase', () => {
  const userTranscript = ['uh, an- and also can you make it spicy', 'my name is-', 'Mahesh. Mahesh.', '123-456-7890'].join('\n');
  const assistantTranscript = "Perfect, Mahesh. And what's your phone number?";
  assert.equal(extractCustomerName(userTranscript, assistantTranscript), 'Mahesh');
});

test('extractConfirmedMenuItems prefers longer exact item names', () => {
  const items = extractConfirmedMenuItems(
    'Let me read back your complete order: Seekh Keebab: $24.00 Garlic Nan: $5.00',
    [
      { id: '1', name: 'Nan', price_cents: 400 },
      { id: '2', name: 'Garlic Nan', price_cents: 500 },
      { id: '3', name: 'Seekh Keebab', price_cents: 2400 }
    ]
  );

  assert.deepEqual(items, [
    { name: 'Seekh Keebab', menuItemId: '3', qty: 1, lineTotalCents: 2400 },
    { name: 'Garlic Nan', menuItemId: '2', qty: 1, lineTotalCents: 500 }
  ]);
});

test('extractFinalReadbackSection returns the last confirmation block', () => {
  const assistantTranscript = [
    'Would you like anything else?',
    'Let me read back your complete order: Seekh Keebab: $24.00 Garlic Nan: $5.00 Total: $29.00',
    "Thanks for calling Mom's Biryani."
  ].join('\n');

  assert.match(extractFinalReadbackSection(assistantTranscript), /Seekh Keebab/);
});

test('extractTotalCentsFromAssistantTranscript reads final usd amount', () => {
  assert.equal(
    extractTotalCentsFromAssistantTranscript('Item one $24.00 Item two $5.00 Total: $29.00'),
    2900
  );
});
