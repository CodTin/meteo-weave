# 工程基础与开发约定

## 1. 范围

沿用单包 TanStack Start 工程。`src/routes/__root.tsx` 提供中文 HTML 文档、head、
深色主题、样式和脚本插槽，并通过 Router 的 `notFoundComponent` 显示可恢复的 404。

- `/` 是中文产品入口（HTTP 200），显示平台身份、演示范围与登录导航。
- `/login` 是 UI-only 登录表单（HTTP 200），提供本地校验、密码可见性切换、Tab、角色说明 Dialog 和通知；不发送凭证或建立会话。
- `/dashboard`、`/tasks/new`、`/tasks`、`/settings` 提供公开工作区预览：共享导航／面包屑、配置流程说明、任务字段表格和设置说明，不读取或保存业务数据。
- 工作区实际路由模块按需加载，提供等待状态、资源失败说明、明确的整页重新加载与安全返回；恢复后显示真实目标内容。
- 未知地址保留 Router 的真实 HTTP 404，同时提供原因与有效返回路径，不做 HTTP 200 的伪 404。

当前不实现认证、数据库、业务 API 或降尺度计算；分辨率示意不代表真实数据或计算结果。

功能目录按平台设计和已有领域术语划分；目前不增加领域实体、状态机、权限规则或接口协议。
登录 UI 校验和工作区预览位于对应 feature；后续业务查询、持久化与计算仍按实际需求添加，避免预先制造空抽象。

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
  不虚构业务 loader 或搜索参数。当前正常访问继续水合真实 SSR 文档。
- 客户端先完成 Start 初始化并核验匹配的工作区模块；仅确认初始模块下载失败时，让 Router 生成错误状态，
  再客户端挂载可用的恢复外壳，避免用错误内容水合成功文档。不关闭全局 SSR，也不屏蔽水合错误。
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
- `src/styles/globals.css` 统一 midnight / slate 背景、storm 主操作、aurora 成功、ember 错误，
  并提供 shadcn 的 card / input / sidebar 等语义映射。原始 storm 配白色小字未通过 axe，
  主按钮使用更深的 storm 变体；错误填充搭配深色前景，状态同时有文字／图标。
- `src/components/ui/` 提供实际使用的 Button、Card、Input、FormField、Tabs 和 Dialog；工作区另有任务字段表格与加载占位，不建立组件展示页。
  Button 是原生按钮，默认 `type="button"`；路由导航用 `Link` + `buttonVariants`，不嵌套按钮和链接，
  不假设有 `asChild`。CardTitle 默认是 `h2`，页面自己提供唯一的 `h1`。
- 标题使用 `font-display`，正文使用 `font-sans`，数据使用 `font-mono` 与 tabular numerals。
  可选本地 Crimson Pro / Inter / JetBrains Mono 通过 `font-display: swap` 使用，
  没有外部字体请求；中文与系统衬线／正文／等宽回退保持可用。
- 品牌分类图表色 `--chart-*` 不可替代气象地图连续色阶；入口网格仅为中性流程示意。
- 根文档固定深色，支持清晰的键盘焦点、跳过导航及 reduced-motion；不增加亮色主题。
- 后续通过 `bun run ui:add <组件名>` 按需添加组件，复用这里的 tokens。
- 登录预览使用 React Hook Form / Zod 做本地表单校验，Sonner 提供界面反馈；不发送认证请求或保存凭证。
  Recharts 与 Zustand 已安装但未为本 Spec 新建样例图表或业务 store。

## 6. 测试和提交检查

- `vitest.config.ts` 与应用构建配置独立，避免 Start / Nitro 插件污染测试运行。
- `unit` 项目使用 Node 环境；`components` 使用 jsdom 和 jest-dom，自带清理。
- 原有 9 项基础测试验证 `cn`、QueryClient 隔离、环境验证、React 测试运行环境，继续保留。
- Playwright 会自行构建、默认在 4173 端口启动 Bun 生产服务并在结束时关闭；不复用未知的已有服务。
  并行工作树用 `E2E_PORT=4181 bun run test:e2e` 指定各自端口（1–65535），不共享构建输出。
- 三浏览器项目均已配置；默认 `test:e2e` 运行 Chromium，`test:e2e:all` 运行全部。
  覆盖产品入口、UI-only 登录交互、工作区导航／表格、未知地址返回与实际路由模块的等待／失败／恢复。
  检查 SSR 实际内容、正确 HTTP 状态、水合、资源失败以及 axe WCAG 2.1 A/AA；包括直接访问失败后重新加载，
  以及正常访问保留服务器 DOM。只定向豁免刻意拦截的确切字体／模块及确切未知文档 404 的预期诊断，
  不忽略其他脚本／样式失败、控制台异常或任何页面／水合错误。
- 入口、登录、404 均在 390、768、1440px 的普通／reduced-motion 模式下检查无整体横向溢出、
  键盘跳转、可见焦点及主要操作；拦截字体下载以验证回退，并保存固定视口全页截图。
  工作区同时检查这三个宽度的导航／生命周期、reduced-motion 与各目标页加载前后主要内容及页脚的稳定位置。
  这些检查不证明尚未实现的业务流程已经符合 WCAG。
- 历史初始化外壳冒烟在本机 Chromium / WebKit 通过；当前 Spec01 回归以 Chromium 为验证范围，不把历史结果当作新增流程的 WebKit 验证。Firefox 在独立启动最小复现中即报 `Could not find profile folder`，
  临时目录 / 持久化 profile / 重新下载均无效。该环境限制未通过跳过或捕获失败来伪装成功，完整套件会如实失败。
- 覆盖率输出到 `coverage/`，浏览器报告到 `playwright-report/`，失败产物到 `test-results/`。
- Husky 提交前依次运行 lint-staged、类型检查和 Vitest；lint-staged 使用 Oxlint + Oxfmt，不额外引入 Prettier。
- 原始设计、参考文档、术语表、已有 skills 和数据被排除在批量格式化之外，避免初始化时无关改写。
- 初始化时仅建立本地 Git 和 hook；该历史审计见第 9 节，不代表当前仓库状态。

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

## 9. 初始化验收记录（历史基线）

- `bun install --frozen-lockfile` 成功，前后锁文件校验值一致。
- `bun run check:all` 成功：格式、Lint、类型检查、9 项基础测试、生产构建、Chromium 冒烟。
- `bun run test:coverage` 成功生成 V8 报告；基础骨架覆盖率不代表产品功能覆盖率。
- 开发服务器已通过 HTTP 文档检查和 Chromium 水合检查，验证后关闭临时服务器。
- WebKit 生产文档 / WCAG 2.1 A/AA 冒烟通过；Firefox 的浏览器启动限制见上文。
- `bun run build:vercel` 成功，产物为 Vercel Build Output v3，函数 runtime 为 Bun。
- `bun run analyze` 成功生成只针对客户端环境的 `reports/bundle.html`。
- `shadcn info` 成功识别 TanStack Start、Tailwind v4、路径别名；未安装任何源码 UI 组件。
- Husky hook 路径已启用；没有暂存、提交、推送或部署。

## 10. 产品入口验收（2026-10-12）

- Ticket 01 先更新浏览器用户路径并观察真实红灯：首页缺少中文 SSR 内容；实现后转绿。
- axe 实测发现原始 storm 按钮对比度 4.2:1，不通过降低检查标准解决，而是调整主操作变体后转绿。
- 404 先验证状态正确但恢复页面缺失的红灯，再接入 Router 的 not-found 组件并验证恢复路径。
- 未更换运行时或框架、未变更依赖锁文件、未增加真实认证或业务服务；提交钩子保持启用。
