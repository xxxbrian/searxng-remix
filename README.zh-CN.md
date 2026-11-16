# SearXNG Remix

[English](README.md) | 简体中文

一个快速、精致的 [SearXNG](https://github.com/searxng/searxng) 前端。SearXNG 是注重隐私的元搜索引擎；本项目保留它来源广、不依赖单一服务商的特点，同时补上现代搜索页该有的能力：带引用的 AI 摘要、按查询意图给出的答案、天气和当地时间实时卡片、图片与视频富结果，以及一个用来管理实例的后台。

技术栈为 SolidJS、TanStack Start、TypeScript 和 Vite。所有与 SearXNG 或 AI 服务的通信都在服务端完成，浏览器既拿不到上游密钥，也不会因为搜索内容去联系第三方。

## 功能

**搜索**

- 服务端渲染的结果页，分为网页、图片、视频、新闻、学术和开发几个标签。
- 图片网格和可用键盘操作的预览；视频卡片显示时长、作者和日期；站点图标经服务端代理加载。
- 时间和语言筛选。搜索语言默认按查询文字判断，其次按浏览器语言，也可以手动指定。
- SearXNG 的即时答案和知识面板，以及按域名屏蔽、降权和提高信任。
- 支持 OpenSearch，浏览器可以把本站添加为搜索引擎，并在地址栏显示联想。

**在合适的地方用 AI**

- **AI 摘要**：可接入任何 OpenAI 兼容接口，基于排名靠前的结果生成并标注引用。可以手动生成；遇到解释、比较、操作步骤类查询且来源足够时也会自动生成。
- **意图判断**：与搜索并行运行，判断查询属于导航、事实、解释、天气等哪一类。它使用 System One 决策接口，默认模型是 TypeSafe 的 [Jev](https://docs.typesafe.ai)；Ollama 和一些模型网关也提供同样的接口。网页结果从不等它；它变慢、缺失或不确定时，页面退回简单规则。
- 涉及实时数据的查询，不会用搜索片段或模型来回答。

**实时卡片**

- **天气**：当前天气和 7 天预报，数据来自 [Open-Meteo](https://open-meteo.com/)。
- **当地时间**：城市或国家的实时时钟，显示 UTC 偏移和与你所在时区的时差。
- 对外只发送提取出的地名和坐标，不发送完整查询，也不发送访客 IP。

**管理后台**（`/admin`）

- 服务状态、请求量、延迟分位数、token 用量和各引擎成功率。
- 启用、停用 SearXNG 引擎并调整权重；配置 AI 与意图模型、缓存、超时和限流，无需重启。
- 本地用量记录（可选择不记录查询文本）、可一键恢复的变更历史，API 密钥加密保存。

**多语言**：界面支持英语、简体中文、繁体中文、日语、德语、法语和西班牙语，按浏览器语言自动选择。

## 快速开始

需要 Node.js 22.13 或更高版本、pnpm 和 Docker。

```sh
docker compose -f docker/docker-compose.yml up -d   # SearXNG 监听 127.0.0.1:8888
cp .env.example .env.local                          # 然后填写
pnpm install
pnpm dev
```

打开 <http://localhost:3000>。设置 `ADMIN_PASSWORD` 后可访问后台 <http://localhost:3000/admin>。

运行生产构建：

```sh
pnpm build
PORT=3000 pnpm start
```

## 配置

环境变量先从进程读取，再从 `.env.local` 读取。不要把 `.env.local` 提交到版本库。

| 变量                                       | 用途                                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEARXNG_URL`                              | SearXNG 地址，默认 `http://localhost:8888`。                                                                                                       |
| `ADMIN_PASSWORD`                           | 启用 `/admin`，至少 12 位。后台保存的 API 密钥也用它派生的密钥加密。                                                                               |
| `DATA_DIR`                                 | 配置、历史、密钥和用量记录的存放目录，默认 `./data`。                                                                                              |
| `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`    | 摘要使用的 OpenAI 兼容服务。地址默认是 OpenAI；设置了密钥和模型才会启用摘要。                                                                      |
| `JEV_API_KEY`、`JEV_BASE_URL`、`JEV_MODEL` | 意图判断，走 System One 接口。默认 `https://api.typesafe.ai/v1` 和 `jev-latest`。`JEV_BASE_URL` 与 `AI_BASE_URL` 是同一主机时，沿用 `AI_API_KEY`。 |
| `PORT`                                     | `pnpm start` 使用的端口。                                                                                                                          |

其余设置大多在后台修改，下一个请求即生效。后台保存的值优先于环境变量。

`docker/searxng/settings.yml` 是 SearXNG 自身的配置，包括引擎凭据、网络超时、插件和本应用需要的 JSON 接口格式。它继承 SearXNG 的默认配置（`use_default_settings: true`），文件里列出的引擎是覆盖项，不是白名单。修改后需重启 SearXNG。

### 数据文件

`DATA_DIR` 中包含：

- `settings.json` 和 `settings.json.bak`：原子写入，并检查版本冲突。
- `history.jsonl`：最近 50 次变更，记录字段名和取值，从不记录密钥值。
- `secrets.json`：后台填写的 API 密钥，使用由 `ADMIN_PASSWORD` 派生的密钥做 AES-256-GCM 加密。修改口令后已存密钥无法解密，需要重新填写。
- `usage.sqlite`：请求类型、耗时、结果数、缓存命中、token、模型、错误，以及可选的查询文本。从不保存返回内容。默认保留 90 天。

请限制这个目录及其备份的访问权限。

## 隐私

- SearXNG 只监听本机，本应用是唯一的对外入口。
- 图片由浏览器直接从来源加载，并使用 `no-referrer`；站点图标由服务端获取。
- AI 请求会把查询和排名靠前的结果片段发给你配置的服务商；实时卡片只发送地名和坐标。
- 用量记录可以关闭，也可以只关闭查询文本。

## 部署说明

- 仓库提供 `Dockerfile`，`docker/docker-compose.prod.yml` 会把应用和它自己的 SearXNG 一起运行。设置 `ADMIN_PASSWORD` 和 `SEARXNG_SECRET`，让反向代理指向 `web` 服务的 3000 端口。配置和密钥保存在 `web-data` 卷里。
- 应用以单个 Node 进程运行，配置写入、缓存和限流都在进程内。不要让多个实例共用同一个 `DATA_DIR`。
- 请放在负责 HTTPS 并设置 `X-Forwarded-For` 的反向代理之后。限流按该请求头中的客户端 IP 计数。
- 记得备份 `DATA_DIR`。

## 开发

```sh
pnpm dev         # 开发服务器，端口 3000
pnpm check       # Biome 检查与格式校验、类型检查、测试
pnpm lint        # 只运行 Biome lint
pnpm format      # 用 Biome 格式化全部代码
pnpm test        # Vitest
pnpm build       # 生产构建，输出到 dist/
```

CI 在 Node 22.13 和 24 上运行同样的检查和构建。

```text
src/routes/     页面、搜索布局、后台、API 路由与 OpenSearch
src/server/     搜索、缓存、配置、认证、AI、意图判断与实时数据（*.server.ts 不会进入浏览器）
src/features/   搜索框、结果、AI 摘要、实时卡片与管理后台
src/lib/        共用类型、配置 schema、语言检测、翻译与错误码
src/ui/         设计令牌与样式
docker/         本地 SearXNG 配置
```

界面上显示的产品名称在 `src/lib/brand.ts` 中设置。

## 致谢

搜索结果来自 [SearXNG](https://github.com/searxng/searxng)。天气数据来自 [Open-Meteo](https://open-meteo.com/)（CC BY 4.0）。地名优先用 Open-Meteo 的地理编码解析，查不到时使用 [OpenStreetMap Nominatim](https://nominatim.org/)，并按其使用政策每秒最多请求一次。

## 许可证

[MIT](LICENSE)
