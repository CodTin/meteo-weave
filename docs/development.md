# 工程初始化与开发约定

## 1. 范围

本次仅搭建单包 TanStack Start 工程，不实现设计中的产品功能。
`src/routes/__root.tsx` 只提供 HTML 文档、head、样式和脚本插槽；没有 `index.tsx`，
没有示例计数器、导航、应用布局或业务页面。没有页面路由时 `/` 返回带 SSR 文档的 404，
不渲染自定义 404 页面；这是没有实现首页的明确结果，而不是伪造一个占位首页。

功能目录按平台设计和已有领域术语划分；目前不增加领域实体、状态机、权限规则或接口协议。
等具体功能开始时，再在对应 feature 下添加组件、校验、查询及测试，避免预先制造空抽象。

## 2. 依赖基线

初始安装日期：2026-10-11。所有直接依赖先使用无版本参数的 `bun add`，当前解析结果以
`package.json` 和 `bun.lock` 为准。没有为沿用旧 API 而降级核心依赖。

| 类别                | 安装内容                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| 应用框架            | React / React DOM、TanStack Start / Router、Vite、React Vite 插件、TypeScript                 |
| 服务端状态          | TanStack Query、`@tanstack/react-router-ssr-query`                                            |
| 客户端状态 / 表单   | Zustand、React Hook Form、`@hookform/resolvers`、Zod                                          |
| 环境变量            | `@t3-oss/env-core`                                                                            |
| 表格                | TanStack Table、TanStack Virtual（虚拟化由后续业务按需使用）                                  |
| 地图 / 几何         | Mapbox GL JS、react-map-gl、Turf、`@types/geojson`                                            |
| 图表 / UI           | Recharts、Tailwind v4 及 Vite 插件、shadcn、Lucide、Sonner、tw-animate-css                    |
| UI 工具             | class-variance-authority、clsx、tailwind-merge                                                |
| 文件 / 日期         | react-dropzone、date-fns                                                                      |
| 单元 / 组件测试     | Vitest、V8 coverage、jsdom、Testing Library React / DOM / jest-dom / user-event               |
| 浏览器测试          | Playwright、`@axe-core/playwright`                                                            |
| 代码规范            | Oxlint、Oxfmt、Husky、lint-staged                                                             |
| 构建与观测          | Nitro、Sentry TanStack Start SDK、Vercel Analytics / Speed Insights、rollup-plugin-visualizer |
| 开发类型 / 路由工具 | Node / Bun / React / React DOM 类型、TanStack Router CLI                                      |

### 兼容性说明

- Zod 使用当前 v4。曾尝试安装 `@tanstack/zod-adapter`，其 peer 依赖仍要求 Zod v3，
  已移除：Router 可原生接受符合 Standard Schema 的 Zod schema，无需回退 Zod。
- Sentry 当前为 v11，隐私选项使用 `dataCollection`，不使用旧版 `sendDefaultPii`。
- Nitro 的 `latest` 标签当前指向 v3 beta，提供 `nitro/vite`；这不是手动选择旧版，
  也是当前 TanStack Start / Vercel 官方文档的集成方式。
- TanStack Table 已安装当前主版本，不默认假设旧 v8 示例可直接使用。
- 本机全局 Bun 1.3.11 无法解析 React 19.3 的生产 SSR 代码，已通过最小复现确认。
  使用无版本参数安装项目本地 `bun`（1.4.3）后同一代码通过，不降级 React、不修改全局 Bun。
  应用脚本经项目本地 Bun 运行；`.bun-version` 和 `packageManager` 记录 1.4.3。
  Node 工具链选用 24.x LTS，
  jsdom 当前要求至少 Node 24.15；`.node-version`、`engines` 已对应设置。
- Bun 是应用运行时和包管理器；测试等 CLI 可由其 Node shebang 使用 Node 运行。
- 一些上游构建包目前会输出 `use client` 模块指令或循环依赖警告。
  项目没有启用 RSC；不通过全局忽略警告或降级来隐藏这些上游提示。

## 3. 路由、SSR 与数据边界

- `src/routes/` 只存放文件路由入口；可复用逻辑放到 feature / lib / server 对应目录。
- `src/routeTree.gen.ts` 是生成文件，不手工编辑、不提交。安装后、类型检查前以及开发 / 构建时自动生成；
  单独运行 `bun run routes:generate` 也可生成。
- `src/start.ts` 默认全文档 SSR。后续按路由需要选择 `ssr: true`、`false` 或 `data-only`，
  不在本次搭建时虚构业务 loader 或搜索参数。
- 后续搜索参数用 Zod schema 配置 `validateSearch`；服务端输入使用 Server Function 的 `inputValidator`。
- `getRouter()` 每次新建 QueryClient，并接入官方 SSR Query integration；缓存不会在不同 SSR 请求间共享，
  provider、脱水 / 水合和查询流式传输由集成负责。
- Query 默认 `staleTime` 为 60 秒，Router 的预加载陈旧判断交给 Query；
  业务轮询以后在气象查询中按需设为 1–5 分钟，不对所有查询全局强制轮询。
- loader 在服务端和浏览器均可能执行，不能把它当成私有后端。
- `src/server/functions/` 放可被客户端导入的 `createServerFn` 声明；
  在 handler 内调用 `src/server/services/` 的服务器实现。
- 私有实现使用 `*.server.ts` 和 `@tanstack/react-start/server-only` 标记，
  不从公共 barrel re-export；Start import protection 在开发和构建中都设为报错。
- Mapbox / WebGL / 浏览器存储等以后通过客户端边界和按需加载使用，不在 SSR 模块顶层访问浏览器 API。
- `data/` 不放在 `public/` 下，不会自动暴露给浏览器。需下载的数据以后通过受控接口交付。

## 4. 环境与监控

`.env.example` 是公开模板，不含凭证；`.env`、`.env.*`（模板除外）被 Git 忽略。

- `src/lib/env/client.ts`：只允许显式列出的 `VITE_*` 公共变量。
- `src/lib/env/server.server.ts`：仅服务器运行时读取，包含 `NODE_ENV` 和服务器 Sentry 设置。
- 空字符串按未设置处理，无凭证时也能启动。布尔值严格区分字符串 `true` / `false`。
- Mapbox 只接受 `pk.*` 公共 token，不能把 `sk.*` 或其他私钥放入 `VITE_*`。
- Vite 公共变量在构建时固化；修改线上公共配置后需重新构建。

| 配置                                                  | 用途 / 启用条件                                |
| ----------------------------------------------------- | ---------------------------------------------- |
| `VITE_MAPBOX_ACCESS_TOKEN`                            | 后续地图使用；当前可留空                       |
| `VITE_ENABLE_TELEMETRY=true`                          | 生产环境启用 Vercel Analytics / Speed Insights |
| `VITE_SENTRY_DSN`                                     | 与生产环境、上面的开关一起启用浏览器 Sentry    |
| `SENTRY_ENABLED=true` + `SENTRY_DSN`                  | 启用服务器 Sentry                              |
| `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | 三项齐全才加载源码映射上传插件                 |

Sentry SDK 在浏览器端按需加载，未启用时不下载其监控实现。初始化覆盖客户端、服务器入口和
Start 全局 middleware；禁用自动采集用户、cookie、HTTP 头 / body、查询参数和栈变量。
服务器使用适合 Vercel 的入口内初始化；无 Node preload 时不保证数据库等第三方库的自动埋点，
当前并未引入数据库。源码映射上传凭证仅供构建使用，不进入客户端变量或应用返回值。

监控、地图和云端部署还需用户自己的账号 / 配置。初始化不创建资源，不上传资料，不进行部署。
Vercel 图像优化没有被视为“安装即自动处理图片”：后续确有图片时，再按部署平台配置优化入口；本次不添加图片组件。

## 5. 样式和组件

- Tailwind v4 使用 Vite 插件和 CSS-first 配置，不生成旧版 `tailwind.config.js` / PostCSS 样板。
- `components.json` 指向 `src/styles/globals.css`，使用 `@/` 别名、TSX、非 RSC、Lucide。
- 只有 shadcn 中性默认 tokens、`cn` 和生成器配置，不复制任何业务或基础可视组件。
- 后续通过 `bun run ui:add button` 等命令按需添加组件，由 CLI 补齐组件特有依赖。
- Recharts、Sonner、Zustand、React Hook Form 等已安装，但不创建样例图表、Toast 挂载器、store 或表单。

## 6. 测试和提交检查

- `vitest.config.ts` 与应用构建配置独立，避免 Start / Nitro 插件污染测试运行。
- `unit` 项目使用 Node 环境；`components` 使用 jsdom 和 jest-dom，自带清理。
- 当前测试只验证 `cn`、QueryClient 隔离、环境验证、React 测试运行环境。
- Playwright 会自行构建、在 4173 端口启动 Bun 生产服务并在结束时关闭；不复用未知的已有服务。
- 三浏览器项目均已配置；默认 `test:e2e` 运行 Chromium，`test:e2e:all` 运行全部。
  检查文档响应、水合期间无浏览器异常以及空壳的 axe WCAG 2.1 A/AA 规则检查。
  这些不是产品功能覆盖，也不证明未来页面已经符合 WCAG。
- 本机 Chromium / WebKit 已通过；Firefox 在独立启动最小复现中即报 `Could not find profile folder`，
  临时目录 / 持久化 profile / 重新下载均无效。该环境限制未通过跳过或捕获失败来伪装成功，完整套件会如实失败。
- 覆盖率输出到 `coverage/`，浏览器报告到 `playwright-report/`，失败产物到 `test-results/`。
- Husky 提交前依次运行 lint-staged、类型检查和 Vitest；lint-staged 使用 Oxlint + Oxfmt，不额外引入 Prettier。
- 原始设计、参考文档、术语表、已有 skills 和数据被排除在批量格式化之外，避免初始化时无关改写。
- 初始化仅建立本地 Git 和 hook，未创建提交、未操作远程仓库。

## 7. 构建和部署

```sh
# 本地 Bun 生产运行
bun run build
bun run start

# 自定义本地生产端口
PORT=4000 bun run start

# 仅构建 Vercel 产物，不部署
bun run build:vercel
```

本地默认使用 Nitro `bun` preset，生成 `.output/`；Vercel 使用 `vercel` preset，生成 `.vercel/output/`。
`vercel.json` 指定 frozen lockfile 安装、构建命令以及 Bun `1.4.x` 运行时。
本地生成的产物不代替真实 Vercel 部署验证；上线前仍需在目标平台构建和验证环境变量。

不要给 Vercel 设置仅静态的 `outputDirectory` 或 SPA fallback，这会丢失 Start 的 SSR / Server Functions。
`public/` 供静态资源使用，未来地图、图表按业务懒加载；`bun run analyze` 用于查看客户端打包组成。

## 8. 核对的官方资料

- [TanStack Start 手动初始化](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch)
- [TanStack Start 部署](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- [Router / Query SSR 集成](https://tanstack.com/router/latest/docs/integrations/query)
- [Start 执行边界](https://tanstack.com/start/latest/docs/framework/react/guide/code-execution-patterns)
- [shadcn 手动安装](https://ui.shadcn.com/docs/installation/manual)
- [t3-env Core](https://env.t3.gg/docs/core)
- [Sentry TanStack Start 配置](https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/)
- [Vercel TanStack Start](https://vercel.com/docs/frameworks/full-stack/tanstack-start)
- [Vercel Bun runtime](https://vercel.com/docs/functions/runtimes/bun)
- [Vitest 配置](https://vitest.dev/config/)
- [Oxfmt 配置](https://oxc.rs/docs/guide/usage/formatter/config.html)

## 9. 初始化验收记录

- `bun install --frozen-lockfile` 成功，前后锁文件校验值一致。
- `bun run check:all` 成功：格式、Lint、类型检查、9 项基础测试、生产构建、Chromium 冒烟。
- `bun run test:coverage` 成功生成 V8 报告；基础骨架覆盖率不代表产品功能覆盖率。
- 开发服务器已通过 HTTP 文档检查和 Chromium 水合检查，验证后关闭临时服务器。
- WebKit 生产文档 / WCAG 2.1 A/AA 冒烟通过；Firefox 的浏览器启动限制见上文。
- `bun run build:vercel` 成功，产物为 Vercel Build Output v3，函数 runtime 为 Bun。
- `bun run analyze` 成功生成只针对客户端环境的 `reports/bundle.html`。
- `shadcn info` 成功识别 TanStack Start、Tailwind v4、路径别名；未安装任何源码 UI 组件。
- Husky hook 路径已启用；没有暂存、提交、推送或部署。
