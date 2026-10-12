# MeteoWeave

气象降尺度演示平台。已提供**中文深色产品入口**、固定演示账号登录与会话恢复、受保护的响应式工作区预览、安全登录回跳、真实退出与账号工作区清理、需重新登录的设置角色切换、服务器角色配置准入、可恢复的路由加载状态与 404，以及 SSR 和开发工具链。

- `/`：产品入口，说明演示范围并引导到登录页，返回 HTTP 200。
- `/login`：公开三类固定演示账号，提供输入校验、密码可见性、Tab、角色说明与可访问反馈；可按统一账号目录预选下次登录账号，但仍需演示密码验证；登录后返回原本请求的有效站内目标；无有效目标时进入 Dashboard。
- `/dashboard`、`/tasks/new`、`/tasks`、`/settings`：需要 Demo 登录的工作区预览，共享导航与面包屑，展示流程、字段表格、当前角色配置能力及未接入状态；设置页支持真实角色切换，不会执行任务或保存分析偏好。
- 工作区模块加载延迟／失败时保留导航与恢复操作；可明确重新加载当前页或返回安全入口。正常访问保留真实 SSR 与水合。
- 未知地址：返回真实 HTTP 404，显示原因并提供返回平台入口和登录入口的链接。

当前提供仅限合成 Demo 数据的轻量账号会话，没有生产认证、地图、任务服务或降尺度计算。工作区和实际身份服务通过同一会话要求检查 SSR、导航及预加载；工作区页头和移动菜单提供键盘可用的退出入口；退出或成功更换登录账号会卸载旧工作区、取消查询并清理内存缓存，再获取新的 SSR 文档。设置页通过同一退出生命周期切换角色：选择不会改变身份，取消／关闭／Escape 保留当前工作区；确认后退出并在登录页仅预选目标账号，不自动登录。退出失败时工作区保持隐藏，聚焦的重试保留已确认目标；重新验证成功后才进入新账号工作区。页面的分辨率图是流程示意，不是计算结果。

退出只结束 Demo 会话并丢弃当前内存工作区，不清空浏览器存储。当前没有真实任务持久化、任务选择或地图状态，不能据此宣称已验证历史任务保留；真实任务持久化／历史保留由 Spec03 #4 补齐，完整配置表单与执行由 Spec05 #6 补齐，地图临时状态由相关后续 Spec 联调。Demo cookie 仅用于合成演示体验，不是生产认证或真实多租户授权。

## Spec02 配置能力与准入边界

- 三类账号共享数据源、空间区域、时间范围、气象变量及目标分辨率控制。研究人员可选推荐／确定性／概率式方法和高级参数；决策者、农业用户仅允许推荐方法且不能提交高级参数覆盖。
- 服务器公共入口 `admitDownscalingConfiguration(input)` 先从当前请求恢复必需 Demo 身份，再校验并规范化配置；POST 适配器为 `admitDownscaling({ data: input })`。客户端的 role／ownerId 不是权限或归属依据。
- 推荐方法默认解析为确定性；研究人员启用不确定性量化时解析为概率式。概率式集合成员可为 5／10／20，默认 10，不表示训练多个真实模型；能力限制不限制未来预置概率案例浏览。
- 这是真实可复用的**配置准入**，不是任务提交／持久化／计算。成功只返回当前 ownerId 和规范化配置，不创建任务 ID、记录、状态或结果；创建页仍禁用提交。#4／#6 必须在真实写入／执行边界调用准入服务并补齐端到端任务测试，不能信任客户端先前拿到的准入结果。
- 稳定输入、输出、错误码和后续接入要求见 [开发说明](docs/development.md)；分析偏好仍为明确未接入的占位。

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
包括匿名直达／刷新／导航、非法回跳、退出后后退／刷新／重新登录、六向角色切换／取消／失败重试／预选值拒绝与重新验证、延迟身份响应隔离、会话失效时的真实模块恢复及正常 SSR DOM 保留；保持严格浏览器错误与 axe 检查。
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
    auth/                  公开 Demo 账号目录、角色映射与统一会话切换
    login/                 演示登录表单与角色说明
    dashboard/             工作区流程与未接入状态预览
    data-catalog/          数据源与数据浏览（仅目录）
    downscaling-tasks/     配置能力、准入校验与任务字段表格（无任务提交／管理服务）
    result-analysis/      结果分析各维度及导出（仅目录）
    task-comparison/       任务对比（仅目录）
    user-settings/         真实角色切换 Dialog 与偏好占位（不保存偏好）
  lib/
    env/                   分离的公开 / 服务器环境变量验证
    query/                 QueryClient 工厂
    monitoring/            按配置启用的 Sentry 初始化
    geo/                   预留地理计算工具
    utils.ts               shadcn 的 cn 工具
  server/
    functions/             Demo 会话与配置准入 Server Functions
    services/              必需会话与配置准入实现（无任务仓库）
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

历史初始化阶段的 Chromium 和 WebKit 生产外壳 / 可访问性冒烟已通过；当前 Spec01／Spec02 新增流程以 Chromium 验证，不据此宣称 WebKit 全套通过。当前机器上的 Playwright Firefox
在打开应用前报 `Could not find profile folder`；默认、独立临时目录、持久化临时 profile
以及重新安装浏览器均能复现，未宣称 Firefox 通过。`test:e2e` 使用 Chromium 作为默认冒烟，
`test:e2e:all` 保留完整三浏览器检查并如实报告失败。修复 Firefox 环境后可直接重跑，无需修改应用。
