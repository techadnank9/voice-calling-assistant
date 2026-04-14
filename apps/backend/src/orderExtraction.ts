type MenuRow = { id: string; name: string; price_cents: number };

const GENERIC_NAME_STOPWORDS = new Set([
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'the',
  'a',
  'an',
  'of',
  'customer',
  'order',
  'caller',
  'user',
  'restaurant',
  'please',
  'okay',
  'ok'
]);

export function extractCustomerName(userTranscript: string, assistantTranscript: string) {
  const normalizedUser = userTranscript.replace(/[,\n]+/g, ' ');
  const nameMatch =
    normalizedUser.match(/my name is\s+(?:like\s+)?([a-z]+(?:\s+[a-z]+){0,2})/i) ??
    normalizedUser.match(/name\s+is\s+([a-z]+(?:\s+[a-z]+){0,2})/i) ??
    normalizedUser.match(/this is\s+([a-z]+(?:\s+[a-z]+){0,2})/i) ??
    normalizedUser.match(/it(?:\s|')?s\s+([a-z]+(?:\s+[a-z]+){0,2})/i) ??
    normalizedUser.match(/([a-z]+(?:\s+[a-z]+){0,2})\s+speaking/i) ??
    normalizedUser.match(/i(?:\s|')?m\s+([a-z]+(?:\s+[a-z]+){0,2})/i) ??
    normalizedUser.match(/under\s+(?:the\s+)?name\s+([a-z]+(?:\s+[a-z]+){0,2})/i);

  let extractedName = nameMatch?.[1] ?? null;
  if (!extractedName) {
    const assistantName =
      assistantTranscript.match(/thank you,\s*(mr\.|mrs\.|ms\.)?\s*([a-z]+(?:\s+[a-z]+){0,2})/i) ??
      assistantTranscript.match(/thanks,\s*(mr\.|mrs\.|ms\.)?\s*([a-z]+(?:\s+[a-z]+){0,2})/i);
    if (assistantName?.[2]) extractedName = assistantName[2];
  }

  if (!extractedName) {
    extractedName = extractStandaloneName(userTranscript);
  }

  return sanitizeExtractedName(extractedName);
}

export function extractConfirmedMenuItems(sourceText: string, menuRows: MenuRow[]) {
  const haystack = sourceText.toLowerCase();
  const matches: Array<{ start: number; end: number; item: MenuRow }> = [];

  for (const item of [...menuRows].sort((a, b) => b.name.length - a.name.length)) {
    const pattern = new RegExp(`\\b${escapeRegExp(item.name.toLowerCase())}\\b`, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (matches.some((existing) => rangesOverlap(existing.start, existing.end, start, end))) continue;
      matches.push({ start, end, item });
    }
  }

  return matches
    .sort((a, b) => a.start - b.start)
    .map(({ item }) => ({
      name: item.name,
      menuItemId: item.id,
      qty: 1,
      lineTotalCents: item.price_cents
    }));
}

export function extractFinalReadbackSection(assistantTranscript: string) {
  const lower = assistantTranscript.toLowerCase();
  const markers = [
    'let me read back your complete order',
    'let me read back your order',
    'your order is',
    'so your order is'
  ];

  let lastIndex = -1;
  for (const marker of markers) {
    const index = lower.lastIndexOf(marker);
    if (index > lastIndex) lastIndex = index;
  }

  if (lastIndex === -1) return '';
  return assistantTranscript.slice(lastIndex);
}

export function extractTotalCentsFromAssistantTranscript(assistantTranscript: string) {
  const matches = [...assistantTranscript.matchAll(/\$ ?(\d+(?:\.\d{2})?)/g)];
  if (matches.length === 0) return null;
  const value = Number(matches[matches.length - 1]?.[1]);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function extractStandaloneName(text: string): string | null {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/my name is/i.test(line)) {
      const next = sanitizeCandidateLine(lines[i + 1]);
      if (next && !containsOnlyGenericWords(next.split(' ').filter(Boolean))) {
        return next;
      }
    }
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = sanitizeCandidateLine(lines[i]);
    if (!candidate) continue;
    const words = candidate.split(' ').filter(Boolean);
    if (words.length === 0 || words.length > 3) continue;
    if (containsOnlyGenericWords(words)) continue;
    return candidate;
  }
  return null;
}

function containsOnlyGenericWords(words: string[]) {
  if (words.length === 0) return true;
  return words.every((word) => GENERIC_NAME_STOPWORDS.has(word.toLowerCase()));
}

function sanitizeExtractedName(name: string | null) {
  if (!name) return null;
  const cleaned = name
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const lowered = cleaned.toLowerCase();
  if (['fine', 'okay', 'ok', 'yes', 'no', 'name', 'my name', 'customer', 'user', 'caller'].includes(lowered)) return null;
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  if (containsOnlyGenericWords(words)) return null;
  return collapseRepeatedName(words).join(' ');
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collapseRepeatedName(words: string[]) {
  if (words.length === 2 && words[0]?.toLowerCase() === words[1]?.toLowerCase()) {
    return [words[0]!];
  }
  return words;
}

function sanitizeCandidateLine(value: string | undefined) {
  if (!value) return null;
  const cleaned = value
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  if (!/^[\p{L}\s'-]+$/u.test(cleaned)) return null;
  return cleaned;
}
