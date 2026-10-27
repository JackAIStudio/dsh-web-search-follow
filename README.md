# dsh-web-search-follow

DeepSeek Harness 的 `web_search` 后端：跟随**当前会话模型**做原生搜索，而不是永远打到官方 DeepSeek 搜索。

仓库：<https://github.com/JackAIStudio/dsh-web-search-follow>

v0.3 支持四大主流模型搜索：

1. **Grok**：走 xAI 独立 Responses Web Search（[`dsh-grok-oauth`](https://github.com/JackAIStudio/dsh-grok-oauth) 的 `grokNativeSearch`）
2. **Gemini**：走 Google Search Grounding（[`dsh-gemini-oauth`](https://github.com/JackAIStudio/dsh-gemini-oauth) 的 `geminiNativeSearch`）
3. **DeepSeek**：走 DeepSeek 官方 Anthropic 兼容 Messages `web_search_20250305`
4. **WorkBuddy（国内版 / 海外版）**：走工作伙伴自己的 `/agenttool/v1/search` 与 `/agenttool/v1/webfetch`（[`dsh-workbuddy-dual`](https://github.com/JackAIStudio/dsh-workbuddy-dual) 的 `workbuddyNativeSearch` / `workbuddyNativeFetch`），用同一个已登录账号，不额外花钱

## 解决什么问题

官方 `web` 插件默认 `searchProvider` 是 DeepSeek 官方搜索（`web-search-deepseek`）。会话换成 Grok / Gemini 之后，模型还是调用内置 `web_search`，但后端仍走 DeepSeek——结果源、语言、账单都不跟当前模型走。

Grok 自带的服务端 `web_search` / `x_search` 更坑：结果是加密的 `tco_*`，agent 循环拿不到明文，经常写一句计划就停。

本插件会：

- 把 `web.searchProvider` 换成 `follow-search`
- 关掉官方 `web-search-deepseek`
- 按**这一轮实际在用的模型**分发到对应厂商的原生搜索

模型侧工具名不变，还是 `web_search`。

## 特性

- **模型工具名不变**：继续调用内置 `web_search`，不用改提示词
- **模型精准跟随**：Grok 走 Grok 搜索；Gemini（如 Gemini 3.8 Flash）走 Google Search；DeepSeek 走 DeepSeek 原生搜索
- **动态识别加固**：优先认当前轮次 live `session.requestHeader()` 与 `snapshotEvents()`，不单信创建时的 `agent.options`，避免跨会话 / 新建会话模型错配
- **杜绝漏金**：未适配的模型（Codex 等）明确报错，不跨服务商乱回退
- **空结果平滑降级**：后端返回 “no sources” 时当成空结果，不把整轮搜索打成失败
- **搜索与抓取同一屋顶**：`web_fetch` 也按当前模型分发。WorkBuddy 模型走托管抓取；其它模型原样转给本机 `http` provider，行为与升级前一致

## 依赖

按你实际用的模型装对应插件，并完成登录 / 配密钥：

| 当前模型 | 需要 |
|---|---|
| Grok | [`dsh-grok-oauth`](https://github.com/JackAIStudio/dsh-grok-oauth) ≥ 0.1.8，已登录 xAI |
| Gemini | [`dsh-gemini-oauth`](https://github.com/JackAIStudio/dsh-gemini-oauth) ≥ 0.2.5，已登录 Google |
| DeepSeek | 设置里已有 `DEEPSEEK_API_KEY`（或环境变量 / `~/.dsh/.credentials.yaml`） |
| WorkBuddy | [`dsh-workbuddy-dual`](https://github.com/JackAIStudio/dsh-workbuddy-dual) ≥ 0.1.6，对应轨道已登录账号 |

host 侧不 `import @deepseek-ai/*`，开发机可以用 `link:`。

## 安装

```bash
# 新电脑 / 从 GitHub 安装
dsh plugin --profile web add github:JackAIStudio/dsh-web-search-follow

# 开发机（本机源码）
dsh plugin --profile web add link:$HOME/Documents/dshspace/plugins/dsh-web-search-follow
```

装完或改了 `index.js` 之后需要**重启 `dsh web`** 才生效。不要自己杀掉正在跑的宿主进程（会中断同一进程上的其他会话）；告诉正在用它的人，让他们自己选时机重启。

## 用法

1. 装好本插件和上表对应的供应商插件，重启 `dsh web`。
2. 在会话里选 Grok / Gemini / DeepSeek / WorkBuddy。
3. 让模型搜索即可。它仍会调用内置 `web_search`；本插件在 host 侧按当前模型把查询转走。

当前模型识别顺序：

1. `session.requestHeader()`（本轮 live header）
2. `session.snapshotEvents()` / 会话事件里最近的 `request/header` 或 `model/selection`
3. `agent.options`（创建 agent 时的配置）
4. 系统默认模型

## 排错速查

- **`grok native search is unavailable`**：没装或没登录 `dsh-grok-oauth`，或版本低于 0.1.8（没有 `ctx.grokNativeSearch`）。
- **`gemini native search is unavailable`**：没装或没登录 `dsh-gemini-oauth`，或版本低于 0.2.5。国内需要代理能出 Google。
- **`no DEEPSEEK_API_KEY`**：设置 → 模型里补 DeepSeek 密钥，或写环境变量 / `$DSH_HOME/.credentials.yaml`。
- **`no current model is selected`**：先在会话里选一个模型。
- **`provider "…" has no native search adapter yet`**：当前供应商还没适配（例如 Codex）。不会偷偷改走 DeepSeek / Grok。需要网页内容时改用 `browser_*`。
- **WorkBuddy 搜索报 `HTTP 403` / `code: 15021 domain rejected by via routing policy`**：这是国内网关自身的域名策略，`anthropic.com`、`openai.com` 一类域名会被挡，GitHub / MDN / 腾讯等正常。换海外版轨道或换域名，不要在本机绕过去。
- **WorkBuddy 抓取报 `HTTP 524`**：上游偶发超时，重试一次通常就好。
- **WorkBuddy 报 `has no signed-in account`**：对应轨道（国内版 / 海外版）还没有登录账号，去插件设置里登录或导入。
- **搜到 0 条**：查询本身没有命中时返回空 `sources`，不是插件挂了。

## 目录结构

- `index.js` —— 注册 `follow-search` provider，按当前模型分发
- `parse.js` —— 解析当前 provider/model，识别 Grok / Gemini / DeepSeek / WorkBuddy
- `deepseek.js` —— DeepSeek Anthropic 兼容 `web_search_20250305`
- `cordis.patch.yml` —— 启用本 provider（搜索与抓取都用它），关掉官方 `web-search-deepseek`
- `test/` —— 分发与空结果降级测试

```bash
node --test test/*.test.js
```

## 许可

MIT
