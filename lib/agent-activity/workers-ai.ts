import type { AgentProviderAttempt } from "./types";

export const WORKERS_AI_MODEL = "@cf/meta/llama-3.2-3b-instruct";
export const WORKERS_AI_TIMEOUT_MS = 4_500;

export type WorkersAiBindingLike = {
  run(
    model: string,
    input: {
      messages: Array<{ role: "system" | "user"; content: string }>;
      max_tokens: number;
      temperature: number;
    },
  ): Promise<unknown>;
};

export type WorkersAiReply = {
  narrative: string;
  tokens?: AgentProviderAttempt["tokens"];
};

let workersAiBindingPromise: Promise<WorkersAiBindingLike | null> | undefined;

function isWorkersAiBinding(value: unknown): value is WorkersAiBindingLike {
  return Boolean(value && typeof value === "object" && "run" in value && typeof value.run === "function");
}

export async function cloudflareWorkersAiBinding(): Promise<WorkersAiBindingLike | null> {
  workersAiBindingPromise ??= (async () => {
    try {
      const workers = await import("cloudflare:workers");
      const binding = workers.env.AI;
      return isWorkersAiBinding(binding) ? binding : null;
    } catch {
      return null;
    }
  })();
  return workersAiBindingPromise;
}

function normalizedTokens(value: unknown): AgentProviderAttempt["tokens"] {
  if (!value || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  const input = usage.prompt_tokens ?? usage.input_tokens;
  const output = usage.completion_tokens ?? usage.output_tokens;
  const total = usage.total_tokens;
  if (![input, output, total].every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0)) {
    return undefined;
  }
  return { input: Math.round(input as number), output: Math.round(output as number), total: Math.round(total as number) };
}

export async function requestWorkersAi(
  binding: WorkersAiBindingLike,
  messages: Array<{ role: "system" | "user"; content: string }>,
  timeoutMs = WORKERS_AI_TIMEOUT_MS,
): Promise<WorkersAiReply> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const payload = await Promise.race([
      binding.run(WORKERS_AI_MODEL, {
        messages,
        max_tokens: 220,
        temperature: 0.15,
      }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new DOMException("Workers AI request timed out.", "AbortError")),
          Math.max(1, timeoutMs),
        );
      }),
    ]);
    if (!payload || typeof payload !== "object") {
      throw new Error("Workers AI did not return a usable brief.");
    }
    const result = payload as {
      response?: unknown;
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: unknown;
    };
    const content = typeof result.response === "string"
      ? result.response
      : result.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Workers AI did not return a usable brief.");
    }
    return { narrative: content, tokens: normalizedTokens(result.usage) };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
