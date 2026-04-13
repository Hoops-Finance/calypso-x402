/**
 * gemma.ts — raw-fetch client for the Gemini API (Gemini 2.5 Flash primary).
 *
 * Uses responseMimeType: "application/json" so Flash returns clean JSON
 * without prose or code fences. The allJsonCandidates extractor is kept
 * as a safety net for edge cases.
 */

import { logger } from "../logger.js";
import { ENV } from "../env.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiOptions {
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
  /** When true, sets responseMimeType to application/json. Default true for Flash models. */
  jsonMode?: boolean;
}

export async function generate(prompt: string, opts: GeminiOptions = {}): Promise<string> {
  if (!ENV.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not set — /plan and AI reviewer disabled");
  }
  const model = opts.model ?? ENV.AI_MODEL;
  const url = `${BASE}/${model}:generateContent?key=${encodeURIComponent(ENV.GEMINI_API_KEY)}`;

  const useJsonMode = opts.jsonMode !== false && model.startsWith("gemini-");

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.2,
    topP: 0.95,
    maxOutputTokens: 4096,
  };
  if (useJsonMode) {
    generationConfig.responseMimeType = "application/json";
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logger.error({ status: res.status, model, errText: errText.slice(0, 500) }, "ai http error");
    throw new Error(`ai http ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text;
}

export function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Extract the first valid JSON from the model output. With Flash in JSON
 * mode the output should parse directly, but this handles edge cases.
 */
export function extractJson(raw: string): string {
  // Direct parse first (Flash JSON mode)
  try {
    JSON.parse(raw);
    return raw.trim();
  } catch { /* fall through */ }

  const candidates: string[] = [];

  const fenceMatch = raw.match(/```json\s*\n?([\s\S]*?)```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());

  const allObjects = findAllBalanced(raw, "{", "}");
  allObjects.sort((a, b) => b.length - a.length);
  candidates.push(...allObjects);

  const fromBracket = reverseExtract(raw, "[", "]");
  if (fromBracket) candidates.push(fromBracket);

  candidates.push(stripFences(raw));

  for (const c of candidates) {
    try {
      JSON.parse(c);
      return c;
    } catch { /* try next */ }
  }

  return candidates[0] ?? stripFences(raw);
}

/**
 * Returns all parseable JSON candidates from model output. With Flash
 * in JSON mode there's usually just one (the raw output). Kept as
 * safety net for schema-aware iteration by callers.
 */
export function allJsonCandidates(raw: string): string[] {
  const out: string[] = [];

  // Flash JSON mode: the entire output is usually valid JSON
  try {
    JSON.parse(raw.trim());
    out.push(raw.trim());
  } catch { /* fall through */ }

  const fenceMatch = raw.match(/```json\s*\n?([\s\S]*?)```/i);
  if (fenceMatch?.[1]) out.push(fenceMatch[1].trim());

  const allObjects = findAllBalanced(raw, "{", "}");
  allObjects.sort((a, b) => b.length - a.length);
  out.push(...allObjects);

  const fromBracket = reverseExtract(raw, "[", "]");
  if (fromBracket) out.push(fromBracket);

  out.push(stripFences(raw));

  const seen = new Set<string>();
  const valid: string[] = [];
  for (const c of out) {
    if (seen.has(c)) continue;
    seen.add(c);
    try {
      JSON.parse(c);
      valid.push(c);
    } catch { /* skip unparseable */ }
  }
  return valid;
}

function findAllBalanced(s: string, opener: string, closer: string): string[] {
  const results: string[] = [];
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
 * Extracts reasoning from the model output. With Flash in JSON mode,
 * reasoning is returned as a field inside the JSON itself (if prompted
 * to include it). Returns the reasoning field value if present.
 */
export function extractReasoning(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed && typeof parsed === "object" && typeof parsed.reasoning === "string" && parsed.reasoning.length > 10) {
      return parsed.reasoning;
    }
  } catch { /* not JSON or no reasoning field */ }

  // Fallback: look for reasoning before JSON block
  const fenceMatch = raw.match(/```json\s*\n?/i);
  if (fenceMatch?.index != null && fenceMatch.index > 20) {
    return raw.slice(0, fenceMatch.index).trim();
  }

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
