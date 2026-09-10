import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCurrentRoute,
  unsupportedRouteMessage,
  isGrokProvider,
  isGeminiProvider,
  isDeepSeekProvider,
} from "../parse.js";

test("identifies supported providers correctly", () => {
  assert.equal(isGrokProvider("grok"), true);
  assert.equal(isGrokProvider("llm-grok"), true);
  assert.equal(isGrokProvider("gemini-oauth"), false);

  assert.equal(isGeminiProvider("gemini-oauth"), true);
  assert.equal(isGeminiProvider("gemini"), true);
  assert.equal(isGeminiProvider("deepseek"), false);

  assert.equal(isDeepSeekProvider("deepseek"), true);
  assert.equal(isDeepSeekProvider("llm-deepseek"), true);
  assert.equal(isDeepSeekProvider("deepseek-official"), true);
  assert.equal(isDeepSeekProvider("grok"), false);
});

test("prefers the live request header over constructor agent options", () => {
  const ctx = {
    get(name) {
      if (name === "agents") {
        return {
          currentInitiator: () => ({
            options: { provider: "deepseek", model: "deepseek-v4-flash" },
            session: {
              requestHeader: () => ({ header: { config: { provider: "gemini-oauth", model: "gemini-3.8-flash-tiered" } } }),
            },
          }),
        };
      }
      return undefined;
    },
  };
  assert.deepEqual(resolveCurrentRoute(ctx), { provider: "gemini-oauth", model: "gemini-3.8-flash-tiered" });
});

test("reads requestHeader().config directly (official EpochHeader shape)", () => {
  const ctx = {
    get(name) {
      if (name === "agents") {
        return {
          currentInitiator: () => ({
            options: { provider: "grok", model: "grok-4.6" },
            session: {
              requestHeader: () => ({ config: { provider: "gemini-oauth", model: "gemini-3.8-flash-tiered" } }),
            },
          }),
        };
      }
      return undefined;
    },
  };
  assert.deepEqual(resolveCurrentRoute(ctx), { provider: "gemini-oauth", model: "gemini-3.8-flash-tiered" });
});

test("falls back to snapshotEvents when requestHeader returns undefined", () => {
  const ctx = {
    get(name) {
      if (name === "agents") {
        return {
          currentInitiator: () => ({
            session: {
              requestHeader: () => undefined,
              snapshotEvents: () => [
                { type: "model/selection", data: { provider: "deepseek", model: "deepseek-v4-flash" } },
                { type: "request/header", data: { header: { config: { provider: "gemini-oauth", model: "gemini-3.8-flash-tiered" } } } },
              ],
            },
          }),
        };
      }
      return undefined;
    },
  };
  assert.deepEqual(resolveCurrentRoute(ctx), { provider: "gemini-oauth", model: "gemini-3.8-flash-tiered" });
});

test("reads model/selection from snapshotEvents when no request/header exists", () => {
  const ctx = {
    get(name) {
      if (name === "agents") {
        return {
          currentInitiator: () => ({
            session: {
              requestHeader: () => undefined,
              snapshotEvents: () => [
                { type: "model/selection", data: { provider: "gemini-oauth", model: "gemini-3.8-flash-tiered" } },
              ],
            },
          }),
        };
      }
      return undefined;
    },
  };
  assert.deepEqual(resolveCurrentRoute(ctx), { provider: "gemini-oauth", model: "gemini-3.8-flash-tiered" });
});

test("falls back to initiating agent options when no header or events exist", () => {
  const ctx = {
    get(name) {
      if (name === "agents") {
        return {
          currentInitiator: () => ({ options: { provider: "grok", model: "grok-4.6" } }),
        };
      }
      return undefined;
    },
  };
  assert.deepEqual(resolveCurrentRoute(ctx), { provider: "grok", model: "grok-4.6" });
});

test("falls back to the default model picker as last resort", () => {
  const ctx = {
    get(name) {
      if (name === "agentDefaultModel") {
        return { currentSelection: () => ({ provider: "deepseek", model: "deepseek-v4-pro" }) };
      }
      return undefined;
    },
  };
  assert.deepEqual(resolveCurrentRoute(ctx), { provider: "deepseek", model: "deepseek-v4-pro" });
});

test("unsupported routes list supported providers", () => {
  const message = unsupportedRouteMessage({ provider: "claude", model: "claude-3-7-sonnet" });
  assert.match(message, /claude/);
  assert.match(message, /supported: Grok, Gemini, DeepSeek/i);
});
