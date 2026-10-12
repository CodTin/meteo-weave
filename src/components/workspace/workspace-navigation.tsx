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
        {workspacePages.map(({ path, title, icon: Icon }) => (
          <li key={path}>
            <Link
              to={path}
              activeOptions={{ exact: true }}
              activeProps={{ className: 'border-sidebar-primary bg-sidebar-accent font-semibold' }}
              inactiveProps={{ className: 'border-transparent text-muted-foreground' }}
              onClick={onNavigate}
              className="flex min-h-12 items-center gap-3 rounded-md border-l-4 px-3 py-3 text-sm hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
