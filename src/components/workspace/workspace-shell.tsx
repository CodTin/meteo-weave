import { useRef } from 'react'
import { WorkspaceMenu } from '@/components/workspace/workspace-menu'
import { Link, Outlet, useLocation, useRouterState } from '@tanstack/react-router'
import { BrandMark } from '@/components/brand/brand-mark'
import { CircleDashed } from 'lucide-react'
import { WorkspaceNavigation, getWorkspaceTitle } from '@/components/workspace/workspace-navigation'

// Reserve the actual preview content footprint at the cards/table breakpoints.
// Keep the public main/footer geometry tests when changing typography or illustration size.
const contentFootprints: Record<string, string> = {
  '/dashboard': 'min-h-[50rem] xl:min-h-[34rem]',
  '/tasks/new': 'min-h-[57rem] md:min-h-[33rem]',
  '/tasks': 'min-h-[47rem] sm:min-h-[35rem] xl:min-h-[30rem]',
  '/settings': 'min-h-[43rem] sm:min-h-[33rem] md:min-h-[30rem]',
}

export function WorkspaceShell() {
  const contentRef = useRef<HTMLElement>(null)
  const pathname = useLocation({ select: (location) => location.pathname })
  const status = useRouterState({ select: (state) => state.matches.at(-1)?.status })
  const title = getWorkspaceTitle(pathname) ?? '工作区'

  return (
    <div className="atmospheric-canvas min-h-svh">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          // Native hash navigation retries failed routes and remounts focused recovery controls.
          // This is an in-page focus action, not a new route visit; retain the no-JS anchor fallback.
          event.preventDefault()
          contentRef.current?.focus({ preventScroll: true })
          contentRef.current?.scrollIntoView({ block: 'start' })
        }}
      >
        跳转到主要内容
      </a>
      <aside
        aria-label="工作区侧栏"
        className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-8 border-r bg-sidebar p-6 text-sidebar-foreground lg:flex"
      >
        <Link
          to="/"
          aria-label="MeteoWeave · 平台入口"
          className="flex items-center gap-3 rounded-md"
        >
          <BrandMark className="size-8" />
          <span className="font-display text-2xl font-bold tracking-tight">MeteoWeave</span>
        </Link>
        <div>
          <p className="eyebrow mb-4 px-3">工作区 / PREVIEW</p>
          <WorkspaceNavigation />
        </div>
        <p className="mt-auto border-t pt-5 text-xs leading-6 text-muted-foreground">
          仅供界面预览
          <br />
          身份认证与任务服务尚未接入
        </p>
      </aside>
      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-sidebar/95 px-5 py-5 backdrop-blur-sm sm:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <WorkspaceMenu contentRef={contentRef} />
            <nav aria-label="面包屑" className="min-w-0 flex-1 text-sm">
              <ol className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <li>
                  <Link to="/" className="rounded-sm hover:text-foreground">
                    平台入口
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>工作区</li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-foreground">
                  {title}
                </li>
              </ol>
            </nav>
            <span className="status-label shrink-0 text-muted-foreground">
              <CircleDashed className="size-3.5 text-ring" aria-hidden="true" />
              界面预览 · 未连接
            </span>
          </div>
        </header>
        <main
          ref={contentRef}
          id="main-content"
          aria-labelledby="workspace-title"
          aria-busy={status === 'pending'}
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-6xl scroll-mt-32 px-5 py-8 sm:px-8 sm:py-10 lg:scroll-mt-24"
        >
          <p className="eyebrow mb-4">METEOWEAVE / WORKSPACE</p>
          <h1 id="workspace-title" className="page-heading mb-8 break-words border-b pb-6">
            {title}
          </h1>
          {/* Keep the footer stable across pending, error and successful page content. */}
          <div className={contentFootprints[pathname.replace(/\/$/, '')] ?? 'min-h-[28rem]'}>
            <Outlet />
          </div>
        </main>
        {/* Announce outside aria-busy so assistive technology need not wait for the download. */}
        <output aria-label="页面访问状态" aria-live="polite" aria-atomic="true" className="sr-only">
          {status === 'pending'
            ? `正在加载${title}页面`
            : status === 'success'
              ? `已进入${title}页面`
              : ''}
        </output>
        <footer className="mx-auto max-w-6xl px-5 pb-6 text-xs leading-6 text-muted-foreground sm:px-8">
          仅用于界面与流程预览 · 不用于业务决策
        </footer>
      </div>
    </div>
  )
}
