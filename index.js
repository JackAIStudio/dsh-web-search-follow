import {
  grokNativeSearchOf,
  geminiNativeSearchOf,
  workBuddyNativeSearchOf,
  workBuddyNativeFetchOf,
  workBuddyRegionOf,
  isGrokProvider,
  isGeminiProvider,
  isDeepSeekProvider,
  isWorkBuddyProvider,
  PROVIDER_ID,
  resolveCurrentRoute,
  unsupportedRouteMessage,
} from "./parse.js";
import { executeDeepSeekSearch } from "./deepseek.js";

export const name = "web-search-follow";
export const inject = ["web"];

/** Local HTTP fetch provider registered by `@deepseek-ai/dsh-web-fetch-http`. */
const LOCAL_FETCH_PROVIDER_ID = "http";

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

      // 4. WorkBuddy hosted search (`/agenttool/v1/search`), one sign-in per region
      if (isWorkBuddyProvider(route.provider)) {
        const workbuddy = workBuddyNativeSearchOf(ctx);
        if (workbuddy === undefined || typeof workbuddy.search !== "function") {
          throw new Error("follow-search: WorkBuddy web search is unavailable; is dsh-workbuddy-dual loaded?");
        }
        const region = workBuddyRegionOf(route.provider);
        try {
          const result = await workbuddy.search(query, {
            model: route.model,
            maxResults: request.maxResults,
            signal,
            ...(region === undefined ? {} : { region }),
          });
          return {
            sources: Array.isArray(result?.sources) ? result.sources : [],
            truncated: result?.truncated === true,
          };
        } catch (error) {
          if (isNoSourcesError(error)) {
            logger?.warn?.("follow-search: workbuddy returned no sources for query=%s (treated as empty result)", query);
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

/**
 * Fetch under the same roof as search, because `ctx.web` selects one fetch
 * provider for the whole Harness.
 *
 * WorkBuddy models get the hosted reader. Everything else is forwarded to the
 * local HTTP provider that is still mounted, so following the model never
 * costs an unrelated provider its fetch capability. That forwarding is not a
 * cross-vendor spend — it is the shipped anonymous reader, and it keeps the
 * current behaviour for every non-WorkBuddy turn.
 */
function createFollowFetchProvider(ctx) {
  // Fetch providers live in the registry map, not as services of their own id.
  const localFetch = () => {
    const registry = ctx?.web?.fetchProviders;
    if (registry === undefined || typeof registry.get !== "function") return undefined;
    return registry.get(LOCAL_FETCH_PROVIDER_ID);
  };

  return {
    id: PROVIDER_ID,
    available() {
      return true;
    },
    async fetch(request, signal) {
      if (signal?.aborted === true) throw abortError(signal);
      const url = typeof request?.url === "string" ? request.url.trim() : "";
      if (url.length === 0) throw new Error("follow-fetch: url must be non-empty");

      const route = resolveCurrentRoute(ctx);
      if (route === null) throw new Error(unsupportedRouteMessage(route));

      if (isWorkBuddyProvider(route.provider)) {
        const logger = ctx.logger ? ctx.logger("follow-fetch") : undefined;
        const workbuddy = workBuddyNativeFetchOf(ctx);
        if (workbuddy === undefined || typeof workbuddy.fetch !== "function") {
          throw new Error("follow-fetch: WorkBuddy web fetch is unavailable; is dsh-workbuddy-dual loaded?");
        }
        const region = workBuddyRegionOf(route.provider);
        logger?.info?.("follow-fetch: provider=%s url=%s", route.provider, url);
        const page = await workbuddy.fetch(url, {
          signal,
          ...(region === undefined ? {} : { region }),
        });
        return {
          url: typeof page?.url === "string" && page.url.length > 0 ? page.url : url,
          statusCode: 200,
          body: { kind: "text", content: typeof page?.content === "string" ? page.content : "" },
          truncated: page?.truncated === true,
        };
      }

      const http = localFetch();
      if (http === undefined || typeof http.fetch !== "function") {
        throw new Error(
          `follow-fetch: provider "${route.provider}" has no hosted fetch, and the local HTTP fetch provider is not mounted`,
        );
      }
      return await http.fetch(request, signal);
    },
  };
}

export function apply(ctx) {
  const web = ctx.web;
  if (web === undefined || typeof web.registerSearchProvider !== "function") return;
  web.registerSearchProvider(createFollowSearchProvider(ctx));
  if (typeof web.registerFetchProvider === "function") {
    web.registerFetchProvider(createFollowFetchProvider(ctx));
  }
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
