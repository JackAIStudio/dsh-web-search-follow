// DeepSeek native web search integration for dsh-web-search-follow

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com/anthropic/v1";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
const USER_AGENT = "dsh-web-search-follow/0.2.0";

export function resolveDeepSeekApiKey(ctx) {
  if (typeof process.env.DEEPSEEK_API_KEY === "string" && process.env.DEEPSEEK_API_KEY.length > 0) {
    return process.env.DEEPSEEK_API_KEY;
  }
  try {
    const credPath = join(homedir(), ".dsh", ".credentials.yaml");
    const content = readFileSync(credPath, "utf8");
    const match = content.match(/DEEPSEEK_API_KEY:\s*(\S+)/);
    if (match && match[1] && match[1].length > 0) {
      return match[1];
    }
  } catch {
    // ignore credential file read failure
  }
  return undefined;
}

function parseDeepSeekAnthropicSources(payload, maxResults) {
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  const resultBlocks = blocks.filter((block) => block?.type === "web_search_tool_result");

  // 提取 citations 中的 snippet
  const snippets = new Map();
  for (const block of blocks) {
    if (block?.type !== "text") continue;
    for (const cite of block?.citations ?? []) {
      if (cite?.url && !snippets.has(cite.url) && typeof cite.cited_text === "string") {
        snippets.set(cite.url, cite.cited_text);
      }
    }
  }

  const seen = new Set();
  const sources = [];

  for (const block of resultBlocks) {
    for (const item of block?.content ?? []) {
      if (item?.type !== "web_search_result" || typeof item.url !== "string" || item.url.length === 0) continue;
      if (seen.has(item.url)) continue;
      seen.add(item.url);

      const snippet = snippets.get(item.url);
      sources.push({
        url: item.url,
        ...(typeof item.title === "string" && item.title.length > 0 ? { title: item.title } : {}),
        ...(snippet && snippet.length > 0 ? { snippet } : {}),
        ...(typeof item.page_age === "string" && item.page_age.length > 0 ? { publishedAt: item.page_age } : {}),
      });
    }
  }

  const limit = typeof maxResults === "number" && maxResults > 0 ? maxResults : sources.length;
  return {
    sources: sources.slice(0, limit),
    truncated: sources.length > limit,
  };
}

export async function executeDeepSeekSearch(ctx, query, options = {}) {
  const apiKey = (await ctx?.get?.("credentials")?.resolve?.("DEEPSEEK_API_KEY"))?.value ?? resolveDeepSeekApiKey(ctx);
  if (!apiKey) {
    throw new Error("follow-search: DeepSeek search has no DEEPSEEK_API_KEY configured (in credentials or environment)");
  }

  const model = options.model && options.model.length > 0 ? options.model : DEEPSEEK_DEFAULT_MODEL;
  const endpoint = `${DEEPSEEK_DEFAULT_BASE_URL}/messages`;

  const body = {
    model,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: `Perform a web search for the query: ${query}` }],
      },
    ],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      authorization: `Bearer ${apiKey}`,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": USER_AGENT,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(`follow-search: DeepSeek API error (HTTP ${response.status}): ${raw.slice(0, 200)}`);
  }

  const payload = await response.json();
  return parseDeepSeekAnthropicSources(payload, options.maxResults);
}
