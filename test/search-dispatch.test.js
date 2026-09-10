import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../index.js";

test("dispatches grok search with exact model", async () => {
  let registeredProvider;
  let grokCalled = false;
  let passedOptions;

  const ctx = {
    web: {
      registerSearchProvider(p) {
        registeredProvider = p;
      },
    },
    get(name) {
      if (name === "agents") {
        return {
          currentInitiator: () => ({
            session: {
              requestHeader: () => ({ config: { provider: "grok", model: "grok-4.6" } }),
            },
          }),
        };
      }
      if (name === "grokNativeSearch") {
        return {
          available: () => true,
          search: async (query, opts) => {
            grokCalled = true;
            passedOptions = opts;
            return {
              sources: [{ url: "https://x.ai", title: "xAI" }],
              truncated: false,
            };
          },
        };
      }
      return undefined;
    },
  };

  apply(ctx);
  assert.ok(registeredProvider);

  const res = await registeredProvider.search({ query: "hello", maxResults: 5 });
  assert.equal(grokCalled, true);
  assert.equal(passedOptions.model, "grok-4.6");
  assert.equal(passedOptions.maxResults, 5);
  assert.equal(res.sources.length, 1);
  assert.equal(res.sources[0].url, "https://x.ai");
});

test("dispatches gemini-oauth search with exact model (e.g. gemini-3.8-flash-tiered)", async () => {
  let registeredProvider;
  let geminiCalled = false;
  let passedOptions;

  const ctx = {
    web: {
      registerSearchProvider(p) {
        registeredProvider = p;
      },
    },
    get(name) {
      if (name === "agents") {
        return {
          currentInitiator: () => ({
            session: {
              requestHeader: () => ({ config: { provider: "gemini-oauth", model: "gemini-3.8-flash-tiered" } }),
            },
          }),
        };
      }
      if (name === "geminiNativeSearch") {
        return {
          available: () => true,
          search: async (query, opts) => {
            geminiCalled = true;
            passedOptions = opts;
            return {
              sources: [{ url: "https://google.com", title: "Google" }],
              truncated: false,
            };
          },
        };
      }
      return undefined;
    },
  };

  apply(ctx);
  assert.ok(registeredProvider);

  const res = await registeredProvider.search({ query: "Google news", maxResults: 8 });
  assert.equal(geminiCalled, true);
  assert.equal(passedOptions.model, "gemini-3.8-flash-tiered");
  assert.equal(passedOptions.maxResults, 8);
  assert.equal(res.sources.length, 1);
  assert.equal(res.sources[0].url, "https://google.com");
});

test("safely handles gemini throwing no sources error as empty sources instead of throwing", async () => {
  let registeredProvider;

  const ctx = {
    web: {
      registerSearchProvider(p) {
        registeredProvider = p;
      },
    },
    get(name) {
      if (name === "agents") {
        return {
          currentInitiator: () => ({
            session: {
              requestHeader: () => ({ config: { provider: "gemini-oauth", model: "gemini-3.8-flash-tiered" } }),
            },
          }),
        };
      }
      if (name === "geminiNativeSearch") {
        return {
          available: () => true,
          search: async () => {
            throw new Error("gemini native search: no sources returned from Google Search grounding");
          },
        };
      }
      return undefined;
    },
  };

  apply(ctx);
  assert.ok(registeredProvider);

  const res = await registeredProvider.search({ query: "obscure-hash-6aa278c90000000026032ef2", maxResults: 8 });
  assert.deepEqual(res.sources, []);
  assert.equal(res.truncated, false);
});
