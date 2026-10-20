# 生产资源加载与性能测量

## 概述

本文档记录 MeteoWeave 在真实生产构建中的资源加载行为、查询复用机制和性能测量方法。所有测量和验证均在本地完成，使用真实生产构建产物，不涉及远程部署或云资源。

## 资源加载策略

### 按需加载（Lazy Loading）

工作区路由模块按页面需要懒加载，不在初始 bundle 中打包所有页面代码。

**实现机制：**

- TanStack Router 的 `createLazyFileRoute` 自动代码分割
- 每个 `.lazy.tsx` 文件编译为独立 chunk
- Router 在导航时动态 import 对应模块

**验证方法：**

1. 生产构建后检查 `.output/public/assets/` 目录
2. 确认存在 `<route>.lazy-<hash>.js` 模式的文件
3. E2E 测试拦截网络请求，验证模块只在访问对应路由时加载

**已验证的懒加载路由：**

- `/dashboard` → `dashboard.lazy-*.js`
- `/tasks` → `index.lazy-*.js`
- `/tasks/new` → `new.lazy-*.js`
- `/tasks/$taskId` → `$taskId.lazy-*.js`
- `/tasks/compare` → `compare.lazy-*.js`
- `/settings` → `settings.lazy-*.js`

### 地图和图表资源

地图（Mapbox GL）和图表（Recharts）资源仅在结果分析页面按需加载，Dashboard 和任务列表等页面不预加载这些重型依赖。

**当前状态：**

- 地图和图表组件已在结果分析中集成
- 非结果页面（Dashboard、任务列表、设置）不加载 Mapbox 或 Recharts
- E2E 测试验证非结果页面无相关资源请求

## 查询复用机制

### TanStack Query 配置

```typescript
// src/lib/query/client.ts
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000 },
    },
  })
}
```

**复用行为：**

- 相同 query key 的查询在 60 秒内复用缓存结果
- 不同 query key（任务 ID、时间、点位、统计身份）触发新查询
- 布局切换、配色调整不改变 query key，不重新计算

**验证方法：**

1. E2E 测试拦截 server function 调用
2. 记录每个 URL 的调用次数
3. 验证在 staleTime 窗口内返回相同页面不产生新请求

### 结果查询身份

任务结果查询的 query key 包含：

- 任务 ID（`taskId`）
- 查询类型（`points`, `time-series`, `grid`, `preview`, `export`）
- 时间切片（`timeSlice`）
- 空间范围（`region` 或 `points`）
- 观测模式（`observationMode`: `stations` | `interpolated`）
- 概率集合选项（`ensemble`: `mean` | `members`）

**不影响查询身份的变化：**

- 地图缩放、平移
- 图表配色方案
- 面板展开/折叠
- Tab 布局切换

这些 UI 状态改变不触发科学结果重新计算。

## SSR 与水合

### SSR 保留

所有工作区路由保持 SSR，初始 HTML 包含：

- 导航外壳
- 页面标题和 meta 信息
- 演示账号身份
- 加载状态占位

**验证：**

- 浏览器禁用 JavaScript 时仍能看到导航外壳和身份信息
- `view-source:` 可见服务器渲染的 HTML 结构
- E2E 测试在 `domcontentloaded` 时检查 SSR 内容

### 水合行为

客户端代码水合服务器传输的 DOM，不替换整个文档：

- 正常情况下复用 SSR DOM 节点
- 模块加载失败时显式重新验证身份并恢复
- 不屏蔽水合错误，browser-guard 捕获所有 page error

**资源失败恢复：**

1. Router 捕获动态 import 失败
2. 显示明确的恢复 UI（保留导航）
3. 用户点击"重新加载"触发 `router.invalidate({ sync: true })`
4. 重新验证会话并获取完整页面

## 性能测量

### 本地测量工具

**`scripts/measure-production.mjs`**

运行方式：

```bash
bun run build
node scripts/measure-production.mjs
```

**测量内容：**

- Bundle 总大小和结构
- 每个懒加载 chunk 的大小
- CSS bundle 大小
- 环境版本（Node、Bun、平台）
- 构建时间戳和产物哈希

**输出：**

- 控制台摘要
- `reports/production/bundle-analysis.json` 详细报告

### E2E 性能测试

**`tests/e2e/production-resources.spec.ts`**

验证场景：

1. 工作区路由按需加载各自的懒加载模块
2. 每个路由加载至少一个 `.lazy-*.js` chunk
3. 地图和图表资源只在结果分析时加载
4. 相同查询参数不触发冗余 server function 调用
5. SSR 外壳正确传输并水合
6. 生产 bundle 有正确的缓存头（hashed 文件名）

运行方式：

```bash
bun run test:e2e tests/e2e/production-resources.spec.ts
```

## 构建警告分类

### 上游包警告

**类型：** `use client` 指令、循环依赖

**来源：** React 19、TanStack 生态系统某些包的内部构建产物

**处理：** 保留警告，不全局静默。项目未启用 RSC，这些指令不影响实际行为。

**验证：** 构建日志中记录，分类为"已知上游行为"

### 有效警告

需要调查和修复的警告，例如：

- 真实的类型错误
- 未使用的导出
- 性能反模式

**处理：** 修复根本原因，不通过配置隐藏

### 无害警告

开发工具或 sourcemap 相关，不影响生产运行。

## 测量环境

### 验证基线

所有测量使用相同的环境配置：

```json
{
  "node": "24.15.0",
  "bun": "1.4.3",
  "platform": "darwin",
  "arch": "arm64"
}
```

### 依赖锁定

`bun.lock` SHA-256: `a0cf70a56e98c3df7be8e318aa95822f2de815f95271931198599f9e4339338f`

**重要：** 不同环境或依赖版本的测量结果不可直接比较。

## 已知限制

### 不包含的内容

1. **真实生产部署：** 所有验证均为本地，不上传到 Vercel 或其他平台
2. **性能 SLA：** 不提供加载时间承诺或性能目标
3. **用户数据上传：** 不读取或发布凭证、源映射或用户数据
4. **远程监控：** 不集成 APM 或外部监控服务
5. **压测应用：** 不创建独立的性能测试应用
6. **私有状态检查：** 不读取 React Query 内部缓存布局或地图引擎状态

### Synthetic Demo 说明

所有任务和结果使用合成演示数据，不是真实气象资料或模型推理结果。性能测量反映演示数据处理，不代表真实科学计算的性能特征。

## 环境变量

### 构建分析

```bash
ANALYZE=true bun run build
```

生成 `reports/bundle.html` 可视化 bundle 组成。

### Vercel 构建

```bash
NITRO_PRESET=vercel bun run build
```

本地验证 Vercel 适配器输出结构，不触发实际部署。

**凭证处理：**

- `SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT` 仅在本地配置时上传 source maps
- `.env` 文件不提交到 Git
- 文档说明变量名称和用途，不输出实际值

## 验收证据

### 测试覆盖

- `tests/e2e/production-resources.spec.ts` 覆盖懒加载和查询复用
- `tests/e2e/workspace-lifecycle.spec.ts` 覆盖 SSR 和水合行为
- `tests/e2e/route-recovery.spec.ts` 覆盖资源失败恢复

### 测量报告

- `reports/production/bundle-analysis.json` 记录 bundle 结构和大小
- `reports/verification/<commit>/result.json` 记录测试执行环境和结果

### 构建产物

- `.output/public/assets/` 包含所有静态资源
- 懒加载 chunk 命名格式：`<route>.lazy-<hash>.js`
- 入口 bundle：`index-<hash>.js`
- CSS bundle：`index-<hash>.css`

## 后续改进方向

1. **真实结果页面验证：** 当完整结果分析 UI 实现后，添加地图和图表懒加载的详细测量
2. **预加载策略：** 考虑 intent preload 或 link prefetch 优化导航体验
3. **Bundle 优化：** 基于实际使用数据调整代码分割策略
4. **真实用户监控：** 生产上线后通过 Vercel Analytics 收集真实加载时间

---

**文档版本：** Spec 16 Ticket #117  
**最后更新：** 2026-10-20  
**验证环境：** 本地开发，真实生产构建产物
