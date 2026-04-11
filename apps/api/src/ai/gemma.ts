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
