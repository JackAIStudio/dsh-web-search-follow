import {
  grokNativeSearchOf,
  geminiNativeSearchOf,
  isGrokProvider,
  isGeminiProvider,
  isDeepSeekProvider,
  PROVIDER_ID,
  resolveCurrentRoute,
  unsupportedRouteMessage,
} from "./parse.js";
import { executeDeepSeekSearch } from "./deepseek.js";

export const name = "web-search-follow";
export const inject = ["web"];

function abortError(signal) {
  const error = new Error("follow-search: search aborted");
  error.name = "AbortError";
  if (signal !== undefined) error.cause = signal.reason;
  return error;
}

function isNoSourcesError(error) {
  if (!error) return false;
  const message = String(error?.message ?? error).toLowerCase();
  return (
    message.includes("no sources") ||
    message.includes("no web_search_tool_result") ||
    message.includes("no results found")
  );
}

function createFollowSearchProvider(ctx) {
  return {
    id: PROVIDER_ID,
    available() {
      return true;
    },
    async search(request, signal) {
      if (signal?.aborted === true) throw abortError(signal);
      const query = typeof request?.query === "string" ? request.query.trim() : "";
      if (query.length === 0) throw new Error("follow-search: query must be non-empty");

      const route = resolveCurrentRoute(ctx);
      const logger = ctx.logger ? ctx.logger("follow-search") : undefined;
      logger?.info?.("follow-search: provider=%s model=%s query=%s", route?.provider, route?.model, query);

      if (route === null) {
        throw new Error(unsupportedRouteMessage(route));
      }

      // 1. Grok Native Search (xAI)
      if (isGrokProvider(route.provider)) {
        const grok = grokNativeSearchOf(ctx);
        if (grok === undefined || typeof grok.search !== "function") {
          throw new Error("follow-search: grok native search is unavailable; is dsh-grok-oauth loaded and signed in?");
        }
        try {
          const result = await grok.search(query, {
            model: route.model,
            maxResults: request.maxResults,
            signal,
          });
          return {
            sources: Array.isArray(result?.sources) ? result.sources : [],
            truncated: result?.truncated === true,
          };
        } catch (error) {
          if (isNoSourcesError(error)) {
            logger?.warn?.("follow-search: grok returned no sources for query=%s (treated as empty result)", query);
            return { sources: [], truncated: false };
          }
          throw error;
        }
      }

      // 2. Gemini Native Search (Google Search Grounding via dsh-gemini-oauth)
      if (isGeminiProvider(route.provider)) {
        const gemini = geminiNativeSearchOf(ctx);
        if (gemini === undefined || typeof gemini.search !== "function") {
          throw new Error("follow-search: gemini native search is unavailable; is dsh-gemini-oauth loaded and signed in?");
        }
        try {
          const result = await gemini.search(query, {
            model: route.model,
            maxResults: request.maxResults,
            signal,
          });
          return {
            sources: Array.isArray(result?.sources) ? result.sources : [],
            truncated: result?.truncated === true,
          };
        } catch (error) {
          if (isNoSourcesError(error)) {
            logger?.warn?.("follow-search: gemini returned no sources for query=%s (treated as empty result)", query);
            return { sources: [], truncated: false };
          }
          throw error;
        }
      }

      // 3. DeepSeek Native Search (Anthropic-compatible Messages web_search)
      if (isDeepSeekProvider(route.provider)) {
        try {
          const result = await executeDeepSeekSearch(ctx, query, {
            model: route.model,
            maxResults: request.maxResults,
            signal,
          });
          return {
            sources: Array.isArray(result?.sources) ? result.sources : [],
            truncated: result?.truncated === true,
          };
        } catch (error) {
          if (isNoSourcesError(error)) {
            logger?.warn?.("follow-search: deepseek returned no sources for query=%s (treated as empty result)", query);
            return { sources: [], truncated: false };
          }
          throw error;
        }
      }

      // 未适配的其它模型：坚决报错，不跨服务商乱回退/漏金
      throw new Error(unsupportedRouteMessage(route));
    },
  };
}

export function apply(ctx) {
  const web = ctx.web;
  if (web === undefined || typeof web.registerSearchProvider !== "function") return;
  web.registerSearchProvider(createFollowSearchProvider(ctx));
}

export {
  grokNativeSearchOf,
  geminiNativeSearchOf,
  isGrokProvider,
  isGeminiProvider,
  isDeepSeekProvider,
  PROVIDER_ID,
  resolveCurrentRoute,
  unsupportedRouteMessage,
} from "./parse.js";
export { executeDeepSeekSearch } from "./deepseek.js";
