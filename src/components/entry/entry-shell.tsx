import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export function EntryShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main-content" className="skip-link">
        跳转到主要内容
      </a>
      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            to="/"
            aria-label="MeteoWeave · 平台入口"
            className="flex min-w-0 items-center gap-3 rounded-md"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 40 40"
              className="size-10 shrink-0 text-primary"
              fill="none"
            >
              <rect
                x="1"
                y="1"
                width="38"
                height="38"
                rx="10"
                fill="currentColor"
                fillOpacity=".12"
                stroke="currentColor"
                strokeOpacity=".4"
              />
              <path
                d="M8 15c5-9 9 9 14 0s7-1 10-1M8 22c5-9 9 9 14 0s7-1 10-1M8 29c5-9 9 9 14 0s7-1 10-1"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <span>
              <span className="block font-display text-2xl font-semibold leading-tight tracking-tight">
                MeteoWeave
              </span>
              <span className="block text-xs tracking-widest text-muted-foreground">
                气象降尺度演示平台
              </span>
            </span>
          </Link>
          <span className="rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">
            DEMO
          </span>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-12"
      >
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-2 px-5 pb-6 text-xs leading-relaxed text-muted-foreground sm:px-8">
        <span>MeteoWeave · 气象数据，精细解读</span>
        <span>仅用于界面与流程演示 · 不用于业务决策</span>
      </footer>
    </div>
  )
}
