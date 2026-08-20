export type AgentProviderConfig = {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function secureBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

function addCandidate(
  target: AgentProviderConfig[],
  candidate: Omit<AgentProviderConfig, "timeoutMs">,
): void {
  if (!candidate.apiKey || !candidate.model || !candidate.baseUrl) return;
  if (target.some((item) => item.apiKey === candidate.apiKey && item.baseUrl === candidate.baseUrl)) return;
  target.push({ ...candidate, timeoutMs: 4_500 });
}

export function configuredAgentProviders(
  environment: NodeJS.ProcessEnv = process.env,
): AgentProviderConfig[] {
  const providers: AgentProviderConfig[] = [];
  const compatibleKey = clean(environment.OPENAI_COMPATIBLE_API_KEY);
  const compatibleBase = secureBaseUrl(clean(environment.OPENAI_COMPATIBLE_BASE_URL));
  const compatibleModel = clean(environment.OPENAI_COMPATIBLE_MODEL);
  addCandidate(providers, {
    provider: clean(environment.OPENAI_COMPATIBLE_PROVIDER) || "OpenAI-compatible provider",
    model: compatibleModel,
    baseUrl: compatibleBase,
    apiKey: compatibleKey,
  });

  const groqModel = clean(environment.GROQ_MODEL) || "openai/gpt-oss-20b";
  const groqBase = "https://api.groq.com/openai/v1";
  addCandidate(providers, {
    provider: "Groq",
    model: groqModel,
    baseUrl: groqBase,
    apiKey: clean(environment.GROQ_API_KEY),
  });

  return providers;
}

export function publicProviderReadiness(
  providers: AgentProviderConfig[] = configuredAgentProviders(),
  workersAiConfigured = false,
): { configured: boolean; names: string[]; deterministicFallback: true } {
  const names = [
    ...(workersAiConfigured ? ["Cloudflare Workers AI"] : []),
    ...providers.map((provider) => provider.provider),
  ];
  return {
    configured: names.length > 0,
    names: Array.from(new Set(names)),
    deterministicFallback: true,
  };
}
