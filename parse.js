export const PROVIDER_ID = "follow-search";
export const GROK_NATIVE_SEARCH_SERVICE = "grokNativeSearch";
export const GEMINI_NATIVE_SEARCH_SERVICE = "geminiNativeSearch";

export const GROK_PROVIDER = "grok";
export const GEMINI_PROVIDER = "gemini-oauth";
export const DEEPSEEK_PROVIDER = "deepseek";

export function isGrokProvider(provider) {
  return provider === "grok" || provider === "llm-grok";
}

export function isGeminiProvider(provider) {
  return provider === "gemini-oauth" || provider === "gemini" || provider === "llm-gemini-oauth";
}

export function isDeepSeekProvider(provider) {
  return provider === "deepseek" || provider === "llm-deepseek" || provider === "deepseek-official";
}

function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

export function decodeHeaderData(data) {
  if (typeof data === "string") {
    try {
      return decodeHeaderData(JSON.parse(data));
    } catch {
      return undefined;
    }
  }
  const record = asRecord(data);
  if (record === undefined) return undefined;
  const header = asRecord(record.header) ?? record;
  const config = asRecord(header.config);
  if (config === undefined) return undefined;
  const provider = typeof config.provider === "string" ? config.provider : undefined;
  const model = typeof config.model === "string" ? config.model : undefined;
  if (!provider) return undefined;
  return { provider, model };
}

function routeFromConfig(config) {
  const record = asRecord(config);
  if (record === undefined) return undefined;
  const provider = typeof record.provider === "string" ? record.provider : undefined;
  const model = typeof record.model === "string" ? record.model : undefined;
  if (!provider) return undefined;
  return { provider, model };
}

function fromRequestHeader(agent) {
  const requestHeader = agent?.session?.requestHeader;
  if (typeof requestHeader !== "function") return undefined;
  try {
    return decodeHeaderData(requestHeader());
  } catch {
    return undefined;
  }
}

function fromAgentOptions(agent) {
  return routeFromConfig(agent?.options);
}

function fromSessionEvents(agent) {
  const session = agent?.session;
  if (!session) return undefined;

  let events;
  if (typeof session.snapshotEvents === "function") {
    try {
      events = session.snapshotEvents();
    } catch {
      events = undefined;
    }
  }
  if (!Array.isArray(events)) {
    events = Array.isArray(session.events) ? session.events : (Array.isArray(session.log) ? session.log : undefined);
  }
  if (!Array.isArray(events)) return undefined;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "request/header") {
      const route = decodeHeaderData(event.data ?? event.payload);
      if (route !== undefined) return route;
    }
    if (event?.type === "model/selection") {
      const data = asRecord(event.data ?? event.payload);
      if (data && typeof data.provider === "string" && data.provider.length > 0) {
        return {
          provider: data.provider,
          model: typeof data.model === "string" ? data.model : undefined,
        };
      }
    }
  }
  return undefined;
}

function fromDefaultModel(ctx) {
  const service = ctx?.get?.("agentDefaultModel") ?? ctx?.agentDefaultModel;
  if (service === undefined || typeof service.currentSelection !== "function") return undefined;
  try {
    const selection = service.currentSelection();
    const provider = typeof selection?.provider === "string" ? selection.provider : undefined;
    const model = typeof selection?.model === "string" ? selection.model : undefined;
    if (!provider) return undefined;
    return { provider, model };
  } catch {
    return undefined;
  }
}

/**
 * Resolve the model this turn actually used.
 * Priority order:
 * 1. session.requestHeader() (live header in current turn)
 * 2. session.snapshotEvents() / session.events (latest request/header or model/selection)
 * 3. agent.options (agent instantiation options)
 * 4. agentDefaultModel (system-wide fallback)
 */
export function resolveCurrentRoute(ctx) {
  const agents = ctx?.get?.("agents") ?? ctx?.agents;
  const agent = typeof agents?.currentInitiator === "function" ? agents.currentInitiator() : undefined;
  return fromRequestHeader(agent) ?? fromSessionEvents(agent) ?? fromAgentOptions(agent) ?? fromDefaultModel(ctx) ?? null;
}

export function grokNativeSearchOf(ctx) {
  return ctx?.get?.(GROK_NATIVE_SEARCH_SERVICE) ?? ctx?.[GROK_NATIVE_SEARCH_SERVICE];
}

export function geminiNativeSearchOf(ctx) {
  return ctx?.get?.(GEMINI_NATIVE_SEARCH_SERVICE) ?? ctx?.[GEMINI_NATIVE_SEARCH_SERVICE];
}

export function unsupportedRouteMessage(route) {
  if (route === null) {
    return "follow-search: no current model is selected; pick a model first. Follow-search supports Grok, Gemini (Google Search), and DeepSeek.";
  }
  return `follow-search: provider "${route.provider}" has no native search adapter yet (supported: Grok, Gemini, DeepSeek). Do not fall back across unrelated providers. Use browser_* if you need the web.`;
}
