/**
 * gemma.ts — tiny raw-fetch client for Gemma 4 via the Gemini API.
 *
 * We do NOT use @google/generative-ai because it doesn't advertise
 * gemma-4-* models in its model picker and its structured-output mode
 * assumes Gemini-class features that Gemma doesn't expose. A tight raw
 * POST is 30 lines and gives us full control over retries and fallbacks.
 */

import { logger } from "../logger.js";
import { ENV } from "../env.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GemmaOptions {
  /** Override the default model (e.g. fallback to gemini-2.0-flash). */
  model?: string;
  /** Sampling temperature; lower = more deterministic JSON output. */
  temperature?: number;
  /** Optional abort signal. */
  signal?: AbortSignal;
}

/**
 * Sends a single-turn text prompt and returns the raw model response.
 * Throws on HTTP errors so the caller can decide retry strategy.
 */
export async function generate(prompt: string, opts: GemmaOptions = {}): Promise<string> {
  if (!ENV.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not set — /plan and AI reviewer disabled");
  }
  const model = opts.model ?? ENV.AI_MODEL;
  const url = `${BASE}/${model}:generateContent?key=${encodeURIComponent(ENV.GEMINI_API_KEY)}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logger.error({ status: res.status, model, errText: errText.slice(0, 500) }, "gemma http error");
    throw new Error(`gemma http ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text;
}

/**
 * Strip markdown code fences the model likes to add even when told not to.
 */
export function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Gemma 4 enters chain-of-thought reasoning mode regardless of prompt
 * instructions, producing `*   ` bullet-style reasoning THEN the
 * actual JSON payload. We try multiple extraction strategies and
 * return the first one that actually parses as valid JSON. The full
 * raw text (including reasoning) is available separately for UI display.
 */
export function extractJson(raw: string): string {
  const candidates: string[] = [];

  // Strategy 1: ```json code fence (most reliable for Gemma)
  const fenceMatch = raw.match(/```json\s*\n?([\s\S]*?)```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());

  // Strategy 2: find ALL balanced { ... } blocks, pick the longest valid one.
  // Gemma's reasoning contains stray braces, so the single-reverse-scan
  // approach sometimes picks an inner array. Scanning all candidates and
  // picking the longest avoids that.
  const allObjects = findAllBalanced(raw, "{", "}");
  // Sort longest first — the full plan object is always bigger than any
  // fragment the reasoning might contain.
  allObjects.sort((a, b) => b.length - a.length);
  candidates.push(...allObjects);

  // Strategy 3: reverse-scan for last balanced [ ... ]
  const fromBracket = reverseExtract(raw, "[", "]");
  if (fromBracket) candidates.push(fromBracket);

  // Strategy 4: plain stripFences
  candidates.push(stripFences(raw));

  // Return the first candidate that parses as valid JSON
  for (const c of candidates) {
    try {
      JSON.parse(c);
      return c;
    } catch {
      // try next
    }
  }

  return candidates[0] ?? stripFences(raw);
}

/**
 * Returns all parseable JSON candidates from Gemma's output, ordered
 * from most likely (fence > longest object > array > stripped).
 * Callers that need schema validation can iterate until one fits.
 */
export function allJsonCandidates(raw: string): string[] {
  const out: string[] = [];

  const fenceMatch = raw.match(/```json\s*\n?([\s\S]*?)```/i);
  if (fenceMatch?.[1]) out.push(fenceMatch[1].trim());

  const allObjects = findAllBalanced(raw, "{", "}");
  allObjects.sort((a, b) => b.length - a.length);
  out.push(...allObjects);

  const fromBracket = reverseExtract(raw, "[", "]");
  if (fromBracket) out.push(fromBracket);

  out.push(stripFences(raw));

  // Deduplicate and filter to parseable JSON
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const c of out) {
    if (seen.has(c)) continue;
    seen.add(c);
    try {
      JSON.parse(c);
      valid.push(c);
    } catch {
      // skip unparseable
    }
  }
  return valid;
}

function findAllBalanced(s: string, opener: string, closer: string): string[] {
  const results: string[] = [];
  // Walk forward looking for each opener and find its balanced closer
  for (let start = 0; start < s.length; start++) {
    if (s[start] !== opener) continue;
    let depth = 0;
    let inString = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === '"' && (i === 0 || s[i - 1] !== "\\")) {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === opener) depth++;
      else if (ch === closer) {
        depth--;
        if (depth === 0) {
          results.push(s.slice(start, i + 1));
          break;
        }
      }
    }
  }
  return results;
}

/**
 * Extracts Gemma's reasoning preamble (everything before the JSON)
 * so the UI can display it. Returns null if no reasoning found.
 */
export function extractReasoning(raw: string): string | null {
  // Find where the JSON starts — everything before it is reasoning
  const fenceMatch = raw.match(/```json\s*\n?/i);
  if (fenceMatch?.index != null && fenceMatch.index > 20) {
    return raw.slice(0, fenceMatch.index).trim();
  }

  // Find the start of the extracted JSON
  const json = extractJson(raw);
  const jsonStart = raw.indexOf(json);
  if (jsonStart > 20) {
    return raw.slice(0, jsonStart).trim();
  }

  return null;
}

function reverseExtract(s: string, opener: string, closer: string): string | null {
  const lastClose = s.lastIndexOf(closer);
  if (lastClose < 0) return null;

  let depth = 0;
  let inString = false;

  for (let i = lastClose; i >= 0; i--) {
    const ch = s[i]!;
    if (ch === '"' && (i === 0 || s[i - 1] !== "\\")) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === closer) depth++;
    else if (ch === opener) {
      depth--;
      if (depth === 0) return s.slice(i, lastClose + 1);
    }
  }
  return null;
}
