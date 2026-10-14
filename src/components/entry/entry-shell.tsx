import { BrandMark } from '@/components/brand/brand-mark'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export function EntryShell({ children }: { children: ReactNode }) {
  return (
    <div className="atmospheric-canvas flex min-h-svh flex-col">
      <a href="#main-content" className="skip-link">
        跳转到主要内容
      </a>
      <header className="border-b bg-sidebar/80">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            to="/"
            aria-label="MeteoWeave · 平台入口"
            className="flex min-w-0 items-center gap-3 rounded-md"
          >
            <BrandMark />
            <span>
              <span className="block font-display text-2xl font-bold leading-tight tracking-tight">
                MeteoWeave
              </span>
              <span className="block text-xs tracking-widest text-muted-foreground">
                气象降尺度演示平台
              </span>
            </span>
          </Link>
          <span className="status-label text-muted-foreground">DEMO</span>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14"
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
