import { Link } from '@tanstack/react-router'
import { LayoutDashboard, ListTodo, Plus, Settings } from 'lucide-react'

export const workspacePages = [
  { path: '/dashboard', title: 'Dashboard', icon: LayoutDashboard },
  { path: '/tasks/new', title: '创建任务', icon: Plus },
  { path: '/tasks', title: '任务管理', icon: ListTodo },
  { path: '/settings', title: '设置', icon: Settings },
] as const

export function getWorkspaceTitle(pathname: string) {
  return workspacePages.find((page) => page.path === pathname.replace(/\/$/, ''))?.title
}

export function WorkspaceNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="工作区导航">
      <ul className="space-y-2">
        {workspacePages.map(({ path, title, icon: Icon }, index) => (
          <li key={path}>
            <Link
              to={path}
              activeOptions={{ exact: true }}
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
