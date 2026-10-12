# 工程基础与开发约定

## 1. 范围

沿用单包 TanStack Start 工程。`src/routes/__root.tsx` 提供中文 HTML 文档、head、
深色主题、样式和脚本插槽，并通过 Router 的 `notFoundComponent` 显示可恢复的 404。

- `/` 是中文产品入口（HTTP 200），显示平台身份、演示范围与登录导航。
- `/login` 提供三类公开固定演示账号、本地必填校验、密码可见性切换、Tab、角色说明 Dialog 和可访问反馈；通过服务器登录入口建立 Demo 会话，默认进入 Dashboard。
- `/dashboard`、`/tasks/new`、`/tasks`、`/settings` 提供需要 Demo 登录的工作区预览：共享导航／面包屑、当前演示账号、配置流程说明、任务字段表格和设置说明，不读取或保存业务数据。登录身份在导航、刷新与直接访问时恢复；未登录先转到登录入口，不先输出受保护内容。
- 工作区实际路由模块按需加载，提供等待状态、资源失败说明、明确的整页重新加载与安全返回；恢复后显示真实目标内容。
- 未知地址保留 Router 的真实 HTTP 404，同时提供原因与有效返回路径，不做 HTTP 200 的伪 404。

当前不实现生产认证、数据库、任务服务或降尺度计算；分辨率示意不代表真实数据或计算结果。#22 提供演示登录与身份恢复，#23 提供工作区／身份服务保护和安全回跳；#24 提供真实退出、账号查询／临时 UI 清理与成功登录的工作区替换；角色切换对话框仍由 #25 实现。

功能目录按平台设计和已有领域术语划分；固定账号目录位于 auth feature，登录 UI 和工作区位于对应 feature。
后续权限规则、业务查询、持久化与计算仍按实际需求添加，避免预先制造空抽象。

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
- 客户端先完成 Start 初始化并核验匹配的工作区模块；仅确认初始模块下载失败时，通过 `router.invalidate({ sync: true })` 重新验证身份与路由，
  再客户端挂载错误外壳或登录页，避免沿用服务器传输的旧身份，或用重定向后的内容水合原工作区文档。不关闭全局 SSR，也不屏蔽水合错误。
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

### Demo 会话与工作区保护（Spec 02 · #22 / #23 / #24）

- `src/features/auth/demo-accounts.ts` 是统一目录：`researcher` / `policy` / `agriculture`，一一对应研究人员 / 决策者 / 农业用户。`DemoAccount`、`demoAccounts`、`resolveDemoAccount` 供角色显示与后续业务复用；公开密码 `DEMO_PASSWORD` 为 `meteo-demo`，不是秘密。
- 客户端可导入 `src/server/functions/demo-session.ts` 的 `loginDemo({ data: { account, password } })`（POST）及 `getDemoSession()`（GET）。实现位于 `src/server/services/demo-session.server.ts`，使用 server-only 标记；`loginDemoAccount` 和 `readDemoSession` 供服务器后续入口复用。
- 服务器校验固定账号和公开密码，不采信额外的 `role`。错误输入返回可纠正错误，不写新会话；缺失或未知 cookie 返回 `null`。失败登录不替换已有有效会话。
- `meteo-demo-account` 是仅含目录账号标识的会话 cookie：HttpOnly、SameSite=Lax、Path=/，HTTPS 时 Secure；无过期时间（浏览器会话范围）。HTTPS 代理须正确覆盖 `X-Forwarded-Proto`；采用 Start 请求协议解析。身份响应设为 `Cache-Control: no-store`。
- 该 cookie **未签名**，不是生产认证、防篡改或真实多租户授权。仅能用于合成 Demo 数据，不能用来保护真实用户或远程数据。页面明确说明此边界，不提供注册或真实凭证管理。
- `/_workspace` 的 `beforeLoad` 在 SSR、导航和 intent preload 中调用 `requireDemoSession({ data: location.href, signal })`，通过 route context 的 `account` 将同一必需身份传给页头与设置页。不跳过预加载检查，不另建身份 store；登录成功经过统一会话切换边界清理旧工作区，以新 SSR 文档重新验证身份；普通工作区导航仍为 SPA。
- `src/server/functions/demo-session.ts` 的 `requireDemoSession` 是工作区实际使用的必需账号读取入口；实现复用 `src/server/services/demo-session.server.ts` 的 `requireDemoAccount(returnTo?)` 与 #22 的 `readDemoSession`。缺失／未知／无效 cookie 抛出带 `no-store` 的 307 登录重定向；正常返回目录中的 `DemoAccount`。公开登录和可选的会话读取保持原契约。后续配置准入／任务服务必须在服务器实际操作前调用 `requireDemoAccount`，不能只靠页面 guard。
- `src/features/auth/return-to.ts` 的 `safeReturnTo` 仅接受当前四个工作区的字面路径：`/dashboard`、`/tasks`、`/tasks/new`、`/settings`。保留正常 query/hash，拒绝绝对／协议相对、反斜线、控制字符、编码路径、登录循环和未知路径；无效目标回退 Dashboard。后续新增真实任务路由时显式扩展，不再次解码已验证目标。
- 登录页用 Zod 解析可选 `returnTo`；服务器重定向与登录后最终导航均校验目标。SSR 请求不携带 fragment，因此登录页也保留浏览器随重定向继承的合法目标 fragment。正常 Query 参数可由 Router 等价重序列化（例如空格 `%20` → `+`）。未知页面继续是真实公开 404。
- `logoutDemo()` 是客户端可调用的 POST；服务器 `endDemoSession()` 仅以同一个 cookie 名、Path=/、Max-Age=0 结束 Demo 会话，保留 HttpOnly、SameSite=Lax 与 HTTPS Secure，并返回 no-store。无会话时也可安全重复调用。底层函数不提供另一套 UI 退出路径。
- `src/features/auth/session-transition.tsx` 的 `DemoSessionBoundary` 位于根路由。工作区页头和移动菜单调用 `useDemoSessionTransition().endSession()`：同步卸载旧页面／菜单，取消查询并清空 Router 预加载；POST 成功后再次清理内存并 `location.replace('/login')`。网络失败保持工作区隐藏，明确说明尚未确认退出，并将键盘焦点交给重试；不假装清 cookie 已成功。
- 公共登录页即使已有会话也可提交另一账号。只有登录成功才调用同一 hook 的 `completeLogin(destination)`；它再校验 `safeReturnTo`，同步卸载旧内容、清理缓存并替换为目标 SSR 文档。错误凭证保留已有会话。只有身份切换使用整文档导航；不把每次普通路由导航变成刷新，也不改动 #23 的初始失败模块／会话过期恢复路径。
- `src/lib/query/client.ts` 的 `discardWorkspaceQueries(queryClient)` 先取消 Query 请求再清除该客户端的 query/mutation 内存缓存。根边界在清理之前卸载内容，因此取消时恢复的数据不会重新显示；文档替换为下个账号创建新的 Router、QueryClient、React 状态及 JS 执行环境，旧响应／回调不能进入新工作区。`router.clearCache()` 用于预加载／缓存，不被误当成当前页面卸载；不通过 `invalidateQueries` 代替清理。
- #25 的确认切换必须调用现有 `endSession()`，不能直接调用 `logoutDemo` 后自行导航或复制清理逻辑。需要预选下次账号时，在此同一入口扩展经目录校验的登录 search 参数；对话框取消不应调用它。`completeLogin` 只在真实登录成功后调用，不是建立身份的 API；任何参数都不能覆盖服务器目录角色。
- 清理范围仅为会话与可丢弃的内存状态，不读取／删除 localStorage、sessionStorage、IndexedDB 或任务仓库。当前真实临时状态是移动导航 Dialog，其卸载执行已有滚动锁清理。未来任务选择、地图实例等应归属这个工作区生命周期；不要在模块级单例里保留跨账号状态。
- 当前没有真实任务持久化／历史、任务选择或地图功能，不创建空 store 或伪造任务来验收。Spec03 #4 和相关任务／地图 Spec 必须补齐真实保存任务在退出及切换后的保留联调；Query 取消不撤销已提交的服务器写操作，也不代替未来持久化服务的账号校验。

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
- 登录使用 React Hook Form / Zod 做本地必填校验，通过持久内联 output（live region）提供等待和错误反馈，未挂载 Toaster。字段错误关联到实际消息文本，服务器拒绝后恢复账号焦点；等待时禁用控件。仅通过同源 POST 发送演示输入，不放入 URL、浏览器凭证存储或日志，继续保留 Sentry 遮罩。
  Recharts 与 Zustand 已安装但未为本 Spec 新建样例图表或业务 store。

## 6. 测试和提交检查

- `vitest.config.ts` 与应用构建配置独立，避免 Start / Nitro 插件污染测试运行。
- `unit` 项目使用 Node 环境；`components` 使用 jsdom 和 jest-dom，自带清理。
- 原有 9 项基础测试验证 `cn`、QueryClient 隔离、环境验证、React 测试运行环境，继续保留。
- Playwright 会自行构建、默认在 4173 端口启动 Bun 生产服务并在结束时关闭；不复用未知的已有服务。
  并行工作树用 `E2E_PORT=4181 bun run test:e2e` 指定各自端口（1–65535），不共享构建输出。
- 三浏览器项目均已配置；默认 `test:e2e` 运行 Chromium，`test:e2e:all` 运行全部。
  覆盖产品入口、Demo 登录交互、匿名保护／安全回跳、工作区导航／表格、未知地址返回与实际路由模块的等待／失败／恢复。三类账号通过真实表单、导航、刷新和直接访问验证 SSR 身份；Vitest 通过真实请求上下文调用公共会话服务，检查 cookie、白名单、错误输入及请求间隔离。退出测试通过真实键盘操作、打开的移动菜单、失败重试和延迟的真实身份响应验证；Query 测试断言公共请求结果和取消，不读取私有 store 或缓存键布局。
  检查 SSR 实际内容、正确 HTTP 状态、水合、资源失败以及 axe WCAG 2.1 A/AA；包括直接访问失败后重新加载，
  以及正常访问保留服务器 DOM。只定向豁免刻意拦截的确切字体／模块及确切未知文档 404 的预期诊断，
  不忽略其他脚本／样式失败、控制台异常或任何页面／水合错误。
- 入口、登录、404 均在 390、768、1440px 的普通／reduced-motion 模式下检查无整体横向溢出、
  键盘跳转、可见焦点及主要操作；拦截字体下载以验证回退，并保存固定视口全页截图。
  工作区通过同一个公开表单辅助模块在独立页面完成真实登录，保持被测页面模块缓存／历史／文档计数初始状态；同时检查这三个宽度的导航／生命周期、reduced-motion 与各目标页加载前后主要内容及页脚的稳定位置。
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
