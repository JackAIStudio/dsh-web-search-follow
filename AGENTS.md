# dsh-web-search-follow

这是 `ctx.web` 搜索提供方，模型跟随型原生 Web Search 适配器。

- 单文件不要超过 300 行；主入口与分发在 `index.js`，路由解析在 `parse.js`，DeepSeek 搜索在 `deepseek.js`
- 禁止写死 `/Users/...`、本机代理、`127.0.0.1:3080`
- 支持三大主流原生搜索引擎：
  - Grok: 调用 `ctx.grokNativeSearch`
  - Gemini: 调用 `ctx.geminiNativeSearch`（Google Search Grounding）
  - DeepSeek: 调用官方 Anthropic-compatible Messages `web_search_20250305`
- 未适配的模型路径明确报错，禁止跨服务商乱回退/漏金
- 当前模型以 `session.requestHeader()` 与 `snapshotEvents()` 为准，不要只信创建时的 `agent.options`
- 改完在插件根目录跑 `node --test test/*.test.js`
