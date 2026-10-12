# MeteoWeave

气象降尺度演示平台。已提供**中文深色产品入口**、固定演示账号登录与会话恢复、响应式工作区预览、可恢复的路由加载状态与 404，以及 SSR 和开发工具链。

- `/`：产品入口，说明演示范围并引导到登录页，返回 HTTP 200。
- `/login`：公开三类固定演示账号，提供输入校验、密码可见性、Tab、角色说明与可访问反馈；登录后默认进入 Dashboard。
- `/dashboard`、`/tasks/new`、`/tasks`、`/settings`：公开工作区预览，共享导航与面包屑，展示流程、字段表格及未接入状态；不会执行任务或保存设置。
- 工作区模块加载延迟／失败时保留导航与恢复操作；可明确重新加载当前页或返回安全入口。正常访问保留真实 SSR 与水合。
- 未知地址：返回真实 HTTP 404，显示原因并提供返回平台入口和登录入口的链接。

当前提供仅限合成 Demo 数据的轻量账号会话，没有生产认证、地图、任务服务或降尺度计算。工作区保护、退出和角色切换由后续票实现。页面的分辨率图是流程示意，不是计算结果。

需求依据：[平台设计](docs/design/platform-design.md)、[技术栈选型](docs/design/tech-stack.md)。
术语沿用 [GLOSSARY.md](GLOSSARY.md)。原始设计文件未修改。

## 启动

需要 Bun 1.4.3+，以及 Node.js 24.15+ 的 24.x LTS（供 Vitest、Playwright、Husky 等工具使用）。
项目已安装本地 Bun 1.4.3，`bun run` 中的应用命令会使用它，不修改系统 Bun。
本机已安装依赖；其他环境首次运行：

```sh
bun install --frozen-lockfile
bun run dev
```

开发服务监听 `http://127.0.0.1:3000`。无需 `.env` 或外部服务账号即可启动。
需要配置集成时，再复制 `.env.example` 为 `.env` 并填写相应变量。

## 常用命令

| 命令                                      | 用途                                        |
| ----------------------------------------- | ------------------------------------------- |
| `bun run dev`                             | Bun 运行 Vite 开发服务                      |
| `bun run build`                           | 生成本地 Bun 生产构建                       |
| `bun run start` / `bun run preview`       | 启动已有生产构建，默认端口 3000             |
| `bun run build:vercel`                    | 生成 Vercel 构建产物，不会部署              |
| `bun run routes:generate`                 | 重新生成类型安全路由树                      |
| `bun run typecheck`                       | 生成路由树并执行严格类型检查                |
| `bun run lint` / `bun run lint:fix`       | Oxlint 检查 / 修复                          |
| `bun run format` / `bun run format:check` | Oxfmt 格式化 / 检查                         |
| `bun run test` / `bun run test:watch`     | Vitest 单次 / 监听测试                      |
| `bun run test:coverage`                   | V8 覆盖率报告                               |
| `bun run test:e2e:install`                | 安装 Playwright 三种浏览器                  |
| `bun run test:e2e`                        | 构建、启动生产服务并运行 Chromium E2E 测试  |
| `bun run test:e2e:all`                    | Chromium、Firefox、WebKit 全部运行          |
| `bun run test:e2e:ui`                     | Playwright 交互调试                         |
| `bun run check`                           | 格式、Lint、类型、单元与组件环境检查        |
| `bun run check:all`                       | 上述检查，再执行生产构建和 E2E              |
| `bun run analyze`                         | 构建并输出 `reports/bundle.html` 包体积报告 |
| `bun run ui:add <组件名>`                 | 后续按需添加 shadcn 源码组件                |

请使用 **`bun run test`**，不是 `bun test`：项目选用 Vitest，而非 Bun 内置测试运行器。
Playwright 首次在其他机器运行前需安装浏览器；Linux CI 可使用 `bunx playwright install --with-deps`。
默认生产测试端口为 4173；并行工作树请使用独立端口，例如 `E2E_PORT=4181 bun run test:e2e`。
浏览器回归覆盖入口、登录交互、工作区导航／表格和真实模块的等待 → 成功、失败 → 重新加载／安全返回，
包括直接访问模块失败及正常 SSR DOM 保留；保持严格浏览器错误与 axe 检查。
在 390、768、1440px 与 reduced-motion 下检查键盘导航、溢出、字体不可下载时的可用性及工作区加载布局稳定性。

## 目录

```text
src/
  routes/                  文档外壳、入口、登录与工作区路由／生命周期
  router.tsx               每次 SSR 请求独立的 Router 和 QueryClient
  start.ts                 SSR 默认设置、全局监控中间件
  client.tsx / server.ts   客户端水合、服务器入口
  components/
    entry/                 入口外壳、分辨率示意、可恢复的 404
    workspace/             导航、面包屑、加载占位与恢复反馈
    ui/                    共享按钮、卡片、表单、Tabs、Dialog（shadcn 语义 tokens）
    maps/ charts/ tables/ forms/  预留跨业务复用的组件
  features/
    auth/                  公开 Demo 账号目录与角色映射
    login/                 演示登录表单与角色说明
    dashboard/             工作区流程与未接入状态预览
    data-catalog/          数据源与数据浏览（仅目录）
    downscaling-tasks/     配置流程说明与任务字段表格（无提交／管理服务）
    result-analysis/      结果分析各维度及导出（仅目录）
    task-comparison/       任务对比（仅目录）
    user-settings/         账号与偏好说明（不保存设置）
  lib/
    env/                   分离的公开 / 服务器环境变量验证
    query/                 QueryClient 工厂
    monitoring/            按配置启用的 Sentry 初始化
    geo/                   预留地理计算工具
    utils.ts               shadcn 的 cn 工具
  server/
    functions/             预留类型安全 Server Functions
    services/              预留服务器内部数据访问
    mocks/                 预留 Mock 数据服务
  hooks/ stores/ types/    预留共享 hooks、Zustand 状态和类型
  styles/                  Tailwind v4、深色语义 tokens、字体回退与 reduced-motion
public/                    公开静态资源
data/                     原始资料及 mock/、precomputed/ 数据预留目录
tests/                    unit/、components/、e2e/、fixtures/
docs/                     设计与开发说明
```

空目录使用 `.gitkeep` 保留，不包含示例业务实现。详细边界、依赖和配置见
[开发说明](docs/development.md)。

## 版本与范围

依赖于 **2026-10-11** 通过不带版本号的 `bun add` 安装，再由 `bun.lock` 锁定。
后续复现请保留锁文件；未安装技术栈文档中的替代选项和未来可选方案。

- 核心：TanStack Start、Router、Query、React、TypeScript、Vite、Nitro。
- 数据与交互：Zustand、React Hook Form、Zod、t3-env、TanStack Table / Virtual。
- 可视化：Mapbox GL JS、react-map-gl、Turf、Recharts、GeoJSON 类型。
- UI：Tailwind v4、shadcn 配置及基础工具、Lucide、Sonner、date-fns、react-dropzone。
- 质量：Vitest、Testing Library、Playwright、axe、Oxlint、Oxfmt、Husky、lint-staged。
- 运维：Sentry、Vercel Analytics / Speed Insights、包体积分析。

数据库、Drizzle、better-auth、Storybook、PWA、国际化、真实气象 API 接入均未引入。
监控默认关闭，只有主动配置后才启用；没有创建或连接任何云端项目。

Husky 提交检查已启用；初始化时的 Git／工具链审计保留在开发说明的历史基线中。

## 已知验证限制

历史初始化阶段的 Chromium 和 WebKit 生产外壳 / 可访问性冒烟已通过；当前 Spec01 新增流程以 Chromium 验证，不据此宣称 WebKit 全套通过。当前机器上的 Playwright Firefox
在打开应用前报 `Could not find profile folder`；默认、独立临时目录、持久化临时 profile
以及重新安装浏览器均能复现，未宣称 Firefox 通过。`test:e2e` 使用 Chromium 作为默认冒烟，
`test:e2e:all` 保留完整三浏览器检查并如实报告失败。修复 Firefox 环境后可直接重跑，无需修改应用。
