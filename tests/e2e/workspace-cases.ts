// Public browser acceptance cases; independent of private Router state and stores.
// Match the real lazy chunk, never the main index bundle or a fabricated endpoint.
export const taskCase = {
  title: '任务管理',
  path: '/tasks',
  module: /\/assets\/index\.lazy-[^/]+\.js$/,
  content: '尚未查询任务，不代表任务数量为零',
  contentHeading: '降尺度任务',
}
export const workspaceCases = [
  taskCase,
  {
    title: 'Dashboard',
    path: '/dashboard',
    module: /\/assets\/dashboard\.lazy-[^/]+\.js$/,
    content: '任务服务尚未接入',
    contentHeading: '身份认证与任务服务尚未接入',
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
    content: '当前无法切换角色或保存设置',
    contentHeading: '账号与偏好设置尚未接入',
  },
]

export function workspaceCase(path: string) {
  const entry = workspaceCases.find((candidate) => candidate.path === path)
  if (!entry) throw new Error(`Missing workspace acceptance case: ${path}`)
  return entry
}
