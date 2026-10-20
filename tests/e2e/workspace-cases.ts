// Public browser acceptance cases; independent of private Router state and stores.
// Match the real lazy chunk, never the main index bundle or a fabricated endpoint.
export const taskCase = {
  title: '任务管理',
  path: '/tasks',
  module: /\/assets\/index\.lazy-[^/]+\.js$/,
  content: '尚未查询任务，不代表任务数量为零',
  contentHeading: '降尺度任务',
}
// Comparison is reached from a selected pair, not a new sidebar destination.
export const compareCase = {
  title: '任务对比',
  path: '/tasks/compare',
  module: /\/assets\/compare\.lazy-[^/]+\.js$/,
  contentHeading: '任务对比',
  content: '正在读取当前账号的两个已完成任务',
}

export const workspaceCases = [
  taskCase,
  {
    title: 'Dashboard',
    path: '/dashboard',
    module: /\/assets\/dashboard\.lazy-[^/]+\.js$/,
    content: '任务服务尚未接入',
    contentHeading: '任务服务尚未接入',
  },
  {
    title: '创建任务',
    path: '/tasks/new',
    module: /\/assets\/new\.lazy-[^/]+\.js$/,
    content: '任务配置与计算尚未接入',
    contentHeading: '任务配置与计算尚未接入',
  },
  {
    title: '设置',
    path: '/settings',
    module: /\/assets\/settings\.lazy-[^/]+\.js$/,
    content: '演示角色与分析偏好',
    contentHeading: '演示角色与分析偏好',
  },
]

export function workspaceCase(path: string) {
  const entry = workspaceCases.find((candidate) => candidate.path === path)
  if (!entry) throw new Error(`Missing workspace acceptance case: ${path}`)
  return entry
}
