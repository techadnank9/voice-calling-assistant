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
  'ok',
  'thank',
  'thanks',
  'bye',
  'goodbye',
  'hello',
  'hi',
  'hey',
  'sure',
  'right',
  'correct',
  'perfect',
  'great',
  'good',
  'yes',
  'no',
  'you'
]);

/**
 * Sequence-aware name extraction: find agent turn that asks for name,
 * then take the immediately following user reply as the name.
 * Mirrors the frontend's inferNameFromMessageSequence logic.
 */
export function inferNameFromMessages(messages: Array<{ role: string; text: string }>) {
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1]!;
    const curr = messages[i]!;
    if (prev.role.toLowerCase() !== 'assistant' && prev.role.toLowerCase() !== 'agent') continue;
    if (curr.role.toLowerCase() !== 'user') continue;
    if (!/(name|full name|what should i call you)/i.test(prev.text)) continue;

    const cleaned = curr.text
      .replace(/[^\p{L}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) continue;

    const words = cleaned.split(' ').filter(Boolean);
    if (words.length < 1 || words.length > 3) continue;
    if (words.every((w) => /^[\p{L}'-]+$/u.test(w))) {
      return sanitizeExtractedName(cleaned);
    }
  }
  return null;
}

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

/** Strip trailing size/portion descriptors so "Mutton Dum Biryani 38Oz" → "Mutton Dum Biryani" */
function shortName(name: string): string {
  return name
    .replace(/\b\d+\s*oz\b/gi, '')
    .replace(/\b\d+[\/-]\d+\s*(people|persons|ppl)?\b/gi, '')
    .replace(/\b(people|persons|ppl)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractConfirmedMenuItems(sourceText: string, menuRows: MenuRow[]) {
  const haystack = sourceText.toLowerCase();
  const matches: Array<{ start: number; end: number; item: MenuRow; qty: number }> = [];

  for (const item of [...menuRows].sort((a, b) => b.name.length - a.name.length)) {
    // Try full name first, then short name (strips "38Oz", "10-12 People", etc.)
    const namesToTry = [item.name, shortName(item.name)].filter(
      (n, i, arr) => n.length > 0 && arr.indexOf(n) === i
    );

    for (const candidate of namesToTry) {
      // Use lookahead/lookbehind instead of \b so items starting/ending with digits
      // (e.g. "7UP", "Pepsi 2L") still match correctly next to spaces and punctuation.
      const escaped = escapeRegExp(candidate.toLowerCase());
      const pattern = new RegExp(`(?<![\\p{L}\\d])${escaped}(?![\\p{L}\\d])`, 'gu');
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(haystack)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (matches.some((existing) => rangesOverlap(existing.start, existing.end, start, end))) continue;

        // Look for a quantity immediately before the item name: "2 ", "2x ", "two "
        const prefix = haystack.slice(Math.max(0, start - 12), start).trim();
        const numericQty = prefix.match(/(\d+)\s*x?\s*$/);
        const wordQty = prefix.match(/\b(two|three|four|five|six|seven|eight|nine|ten)\s*$/i);
        const wordQtyMap: Record<string, number> = {
          two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10
        };
        const qty = numericQty
          ? Math.max(1, parseInt(numericQty[1]!, 10))
          : wordQty
            ? (wordQtyMap[wordQty[1]!.toLowerCase()] ?? 1)
            : 1;

        matches.push({ start, end, item, qty });
      }
    }
  }

  // Deduplicate: if the same menu item appears multiple times (e.g. mentioned when ordering
  // and again in the readback), keep the occurrence with the highest qty.
  const byItemId = new Map<string, { start: number; end: number; item: MenuRow; qty: number }>();
  for (const m of matches) {
    const existing = byItemId.get(m.item.id);
    if (!existing || m.qty > existing.qty) {
      byItemId.set(m.item.id, m);
    }
  }

  return [...byItemId.values()]
    .sort((a, b) => a.start - b.start)
    .map(({ item, qty }) => ({
      name: item.name,
      menuItemId: item.id,
      qty,
      lineTotalCents: item.price_cents * qty,
      isCustom: false as const
    }));
}

export function extractFinalReadbackSection(assistantTranscript: string) {
  const lower = assistantTranscript.toLowerCase();
  const markers = [
    'let me read back your complete order',
    'let me read back your order',
    'here is your complete order',
    "here's your complete order",
    'here is your order',
    "here's your order",
    'to confirm your order',
    "let me confirm your order",
    'your complete order is',
    'your order is',
    'so your order is',
    'order summary',
    'to summarize your order',
    'just to confirm your order',
    'just to recap'
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

/** Tokenize a string into lowercase words, stripping punctuation. */
function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\d\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Parse the ElevenLabs Data Collection `order_items` string format, e.g.
 * "1x Gongura Mutton Biryani, 2x Naan, 1x Rose Milk"
 *
 * For each item it attempts, in order:
 *   1. Exact match (case-insensitive) against menu item name or its shortName
 *   2. Word-overlap fuzzy match (≥2 overlapping words OR ≥50% of DC words present)
 *   3. Custom fallback (isCustom: true, menuItemId: undefined, lineTotalCents: 0)
 */
export function parseElevenLabsDcItems(
  dcItemsText: string,
  menuRows: Array<{ id: string; name: string; price_cents: number }>
): Array<{ name: string; menuItemId?: string; qty: number; lineTotalCents: number; isCustom: boolean }> {
  if (!dcItemsText || !dcItemsText.trim()) return [];

  const segments = dcItemsText.split(',').map((s) => s.trim()).filter(Boolean);

  return segments.map((segment) => {
    // Extract optional quantity prefix in formats: "2x Biryani", "2 x Biryani", or "2 Biryani"
    // Also handle plain numeric prefix "2 Mango Lassi" where the rest is clearly a name.
    const qtyXMatch = segment.match(/^(\d+)\s*x\s+/i);
    const qtyPlainMatch = !qtyXMatch ? segment.match(/^(\d+)\s+(?=\S)/) : null;
    const qtyMatch = qtyXMatch ?? qtyPlainMatch;
    const qty = qtyMatch ? Math.max(1, parseInt(qtyMatch[1]!, 10)) : 1;
    const rawName = qtyMatch ? segment.slice(qtyMatch[0].length).trim() : segment.trim();

    if (!rawName) {
      return { name: segment, qty, lineTotalCents: 0, isCustom: true };
    }

    const rawNameLower = rawName.toLowerCase();

    // --- Pass 1: exact match against full name or shortName (case-insensitive) ---
    for (const item of menuRows) {
      if (
        item.name.toLowerCase() === rawNameLower ||
        shortName(item.name).toLowerCase() === rawNameLower
      ) {
        return {
          name: item.name,
          menuItemId: item.id,
          qty,
          lineTotalCents: item.price_cents * qty,
          isCustom: false
        };
      }
    }

    // --- Pass 2: word-overlap fuzzy match ---
    const dcWords = tokenizeWords(rawName);
    let bestItem: (typeof menuRows)[number] | null = null;
    let bestOverlap = 0;

    for (const item of menuRows) {
      const menuWords = tokenizeWords(item.name);
      const menuWordSet = new Set(menuWords);
      const overlap = dcWords.filter((w) => menuWordSet.has(w)).length;

      const isGoodEnough =
        overlap >= 2 || (dcWords.length > 0 && overlap / dcWords.length >= 0.5);

      if (isGoodEnough && overlap > bestOverlap) {
        bestOverlap = overlap;
        bestItem = item;
      }
    }

    if (bestItem) {
      return {
        name: bestItem.name,
        menuItemId: bestItem.id,
        qty,
        lineTotalCents: bestItem.price_cents * qty,
        isCustom: false
      };
    }

    // --- Pass 3: unmatched custom fallback ---
    return { name: rawName, qty, lineTotalCents: 0, isCustom: true };
  });
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
  if (['fine', 'okay', 'ok', 'yes', 'no', 'name', 'my name', 'customer', 'user', 'caller',
       'thank you', 'thank', 'thanks', 'bye', 'goodbye', 'hello', 'hi', 'hey',
       'sure', 'right', 'correct', 'perfect', 'great', 'good', 'hold on',
       'please', 'sorry', 'excuse me'].includes(lowered)) return null;
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
