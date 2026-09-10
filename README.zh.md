# dsh-web-search-follow

DeepSeek Harness 的 `web_search` 后端：跟随**当前会话模型**做原生搜索。

v0.2 支持三大主流模型原生搜索：
1. **Grok**：走 xAI 独立 Responses Web Search（`dsh-grok-oauth` 的 `grokNativeSearch`）
2. **Gemini**：走 Google Search Grounding（`dsh-gemini-oauth` 的 `geminiNativeSearch`）
3. **DeepSeek**：走 DeepSeek 官方 Anthropic 兼容 Messages `web_search_20250305`

## 特性

- **模型工具名不变**：模型继续调用内置 `web_search` 工具
- **模型精准跟随**：会话使用 Grok 就走 Grok 搜索；使用 Gemini（如 Gemini 3.8 Flash）就走 Google Search；使用 DeepSeek 就走 DeepSeek 原生搜索
- **动态识别加固**：优先识别当前轮次 live `session.requestHeader()` 与 `snapshotEvents()`，杜绝跨会话/新建会话时的模型错配
- **杜绝漏金**：未适配的模型坚决明确报错，不跨服务商乱回退，保护用户余额

## 安装

源码在 `~/Documents/dshspace/plugins/dsh-web-search-follow`。

```bash
dsh plugin --profile web add link:$HOME/Documents/dshspace/plugins/dsh-web-search-follow
```
