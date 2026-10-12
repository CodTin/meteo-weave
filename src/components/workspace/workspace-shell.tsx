import { Button } from '@/components/ui/button'
import { useDemoSessionTransition } from '@/features/auth/session-transition'
import { useRef } from 'react'
import { WorkspaceMenu } from '@/components/workspace/workspace-menu'
import { Link, Outlet, useLocation, useRouterState, useRouteContext } from '@tanstack/react-router'
import { Layers } from 'lucide-react'
import { WorkspaceNavigation, getWorkspaceTitle } from '@/components/workspace/workspace-navigation'

// Reserve each page's content at the same breakpoints as its cards/table.
const contentFootprints: Record<string, string> = {
  '/dashboard': 'min-h-[29rem] sm:min-h-[28rem]',
  '/tasks/new': 'min-h-[49rem] md:min-h-[28rem]',
  '/tasks': 'min-h-[44rem] sm:min-h-[33rem] xl:min-h-[29rem]',
  '/settings': 'min-h-[38rem] sm:min-h-[31rem] md:min-h-[28rem]',
}

export function WorkspaceShell() {
  const { endSession } = useDemoSessionTransition()
  const { account } = useRouteContext({ from: '/_workspace' })
  const contentRef = useRef<HTMLElement>(null)
  const pathname = useLocation({ select: (location) => location.pathname })
  const status = useRouterState({ select: (state) => state.matches.at(-1)?.status })
  const title = getWorkspaceTitle(pathname) ?? '工作区'

  return (
    <div className="min-h-svh">
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
          <Layers className="size-7 text-ring" aria-hidden="true" />
          <span className="font-display text-2xl font-semibold">MeteoWeave</span>
        </Link>
        <div>
          <p className="mb-4 px-3 text-xs tracking-widest text-muted-foreground">工作区 / DEMO</p>
          <WorkspaceNavigation />
        </div>
        <p className="mt-auto border-t pt-5 text-xs leading-6 text-muted-foreground">
          Demo 体验 · 合成数据
          <br />
          非生产认证 · 任务服务尚未接入
        </p>
      </aside>
      <div className="min-w-0 lg:pl-64">
        <header className="border-b bg-background px-5 py-5 sm:px-8">
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
            <section
              aria-label="当前演示账号"
              className="rounded-lg border px-3 py-2 text-xs leading-6"
            >
              {account ? (
                <>
                  <p>
                    {account.name} · {account.id}
                  </p>
                  <p className="text-muted-foreground">
                    {account.roleLabel} · {account.roleTitle}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">未登录 · 工作区预览</p>
              )}
            </section>
            <Button variant="outline" onClick={() => void endSession()}>
              退出登录
            </Button>
          </div>
        </header>
        <main
          ref={contentRef}
          id="main-content"
          aria-labelledby="workspace-title"
          aria-busy={status === 'pending'}
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-6xl px-5 py-8 sm:px-8 sm:py-10"
        >
          <p className="mb-3 font-mono text-xs tracking-widest text-muted-foreground">
            METEOWEAVE / WORKSPACE
          </p>
          <h1
            id="workspace-title"
            className="mb-7 break-words font-display text-3xl font-semibold tracking-tight sm:text-4xl"
          >
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
          仅用于合成 Demo 数据与流程演示 · 不用于真实数据授权或业务决策
        </footer>
      </div>
    </div>
  )
}
