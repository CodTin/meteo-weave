import { Link, useLocation } from '@tanstack/react-router'
import { LayoutDashboard, ListTodo, Plus, Settings } from 'lucide-react'

export const workspacePages = [
  { path: '/dashboard', title: 'Dashboard', icon: LayoutDashboard },
  { path: '/tasks/new', title: '创建任务', icon: Plus },
  { path: '/tasks', title: '任务管理', icon: ListTodo },
  { path: '/settings', title: '设置', icon: Settings },
] as const

export function getWorkspaceTitle(pathname: string) {
  const path = pathname.replace(/\/$/, '')
  if (path === '/tasks/compare') return '任务对比'
  return workspacePages.find((page) => page.path === path)?.title
}

export function WorkspaceNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const onComparison = useLocation({
    select: (location) => location.pathname.replace(/\/$/, '') === '/tasks/compare',
  })

  return (
    <nav aria-label="工作区导航">
      <ul className="space-y-2">
        {workspacePages.map(({ path, title, icon: Icon }, index) => (
          <li key={path}>
            <Link
              to={path}
              // Comparison belongs to task management; other destinations keep exact matching.
              activeOptions={{ exact: path !== '/tasks' || !onComparison }}
              activeProps={{ className: 'border-sidebar-primary font-semibold text-foreground' }}
              inactiveProps={{ className: 'border-transparent text-muted-foreground' }}
              onClick={onNavigate}
              className="workspace-link flex min-h-12 items-center gap-3 rounded-md border-l-2 px-3 py-3 text-sm hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span>{title}</span>
              <span aria-hidden="true" className="ml-auto font-mono text-xs text-muted-foreground">
                0{index + 1}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
