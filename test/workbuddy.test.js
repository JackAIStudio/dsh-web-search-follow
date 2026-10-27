import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../index.js";

function routeCtx({ provider, extras = {}, fetchProviders } = {}) {
  const registered = { search: undefined, fetch: undefined };
  const ctx = {
    web: {
      registerSearchProvider(p) {
        registered.search = p;
      },
      registerFetchProvider(p) {
        registered.fetch = p;
      },
      ...(fetchProviders === undefined ? {} : { fetchProviders }),
    },
    get(name) {
      if (name === "agents") {
        return {
          currentInitiator: () => ({
            session: { requestHeader: () => ({ config: { provider, model: "deepseek-v4.1-flash" } }) },
          }),
        };
      }
      return extras[name];
    },
  };
  apply(ctx);
  return registered;
}

test("dispatches WorkBuddy Global search to the hosted service with its region", async () => {
  let received;
  const registered = routeCtx({
    provider: "workbuddy-global",
    extras: {
      workbuddyNativeSearch: {
        available: () => true,
        search: async (query, options) => {
          received = { query, options };
          return { sources: [{ url: "https://www.workbuddy.ai/docs", title: "Docs" }], truncated: false };
        },
      },
    },
  });

  const result = await registered.search.search({ query: "harness", maxResults: 3 });
  assert.equal(received.query, "harness");
  assert.equal(received.options.region, "global");
  assert.equal(received.options.maxResults, 3);
  assert.deepEqual(result.sources, [{ url: "https://www.workbuddy.ai/docs", title: "Docs" }]);
});

test("dispatches WorkBuddy CN search with the cn region", async () => {
  let region;
  const registered = routeCtx({
    provider: "workbuddy-cn",
    extras: {
      workbuddyNativeSearch: {
        available: () => true,
        search: async (_query, options) => {
          region = options.region;
          return { sources: [], truncated: false };
        },
      },
    },
  });

  await registered.search.search({ query: "harness" });
  assert.equal(region, "cn");
});

test("reports a missing WorkBuddy service instead of falling back to another vendor", async () => {
  const registered = routeCtx({ provider: "workbuddy-global" });
  await assert.rejects(
    () => registered.search.search({ query: "harness" }),
    /WorkBuddy web search is unavailable/u,
  );
});

test("fetches WorkBuddy pages through the hosted reader", async () => {
  let requested;
  const local = {
    id: "http",
    available: () => true,
    fetch: async () => {
      throw new Error("local fetch must not run for a WorkBuddy model");
    },
  };
  const registered = routeCtx({
    provider: "workbuddy-global",
    fetchProviders: new Map([["http", local]]),
    extras: {
      workbuddyNativeFetch: {
        available: () => true,
        fetch: async (url, options) => {
          requested = { url, options };
          return { url, content: "# Page\n\nbody", contentType: "text/markdown" };
        },
      },
    },
  });

  const result = await registered.fetch.fetch({ url: "https://claude.com/pricing" });
  assert.equal(requested.url, "https://claude.com/pricing");
  assert.equal(requested.options.region, "global");
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.kind, "text");
  assert.match(result.body.content, /body/u);
});

test("forwards a non-WorkBuddy fetch to the mounted http provider", async () => {
  let forwarded;
  const local = {
    id: "http",
    available: () => true,
    fetch: async (request) => {
      forwarded = request;
      return { url: request.url, statusCode: 204, body: { kind: "text", content: "" }, truncated: false };
    },
  };
  const registered = routeCtx({
    provider: "deepseek",
    fetchProviders: new Map([["http", local]]),
  });

  const result = await registered.fetch.fetch({ url: "https://example.com" });
  assert.equal(forwarded.url, "https://example.com");
  assert.equal(result.statusCode, 204);
});

test("fails clearly when neither a hosted nor a local fetch provider can serve the URL", async () => {
  const registered = routeCtx({ provider: "deepseek", fetchProviders: new Map() });
  await assert.rejects(
    () => registered.fetch.fetch({ url: "https://example.com" }),
    /local HTTP fetch provider is not mounted/u,
  );
});
