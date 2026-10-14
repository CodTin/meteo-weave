import { LockKeyhole } from 'lucide-react'
import '@/styles/spec02.css'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Outlet, useRouter } from '@tanstack/react-router'
import { safeReturnTo } from '@/features/auth/return-to'
import { resolveDemoAccount } from '@/features/auth/demo-accounts'
import { discardWorkspaceQueries } from '@/lib/query/client'
import { logoutDemo } from '@/server/functions/demo-session'
import { Button } from '@/components/ui/button'

const SessionTransition = createContext<{
  endSession: (targetAccount?: string) => Promise<void>
  completeLogin: (destination: string) => Promise<void>
} | null>(null)

// One transition for workspace logout and confirmed settings switches.
export function useDemoSessionTransition() {
  const transition = useContext(SessionTransition)
  if (!transition) throw new Error('Demo session transitions require DemoSessionBoundary')
  return transition
}

export function DemoSessionBoundary() {
  const router = useRouter()
  const [leaving, setLeaving] = useState<'login' | 'logout' | null>(null)
  const [failed, setFailed] = useState(false)
  const retryRef = useRef<HTMLButtonElement>(null)
  const logoutDestination = useRef<string | null>(null)
  useEffect(() => {
    if (failed) retryRef.current?.focus()
  }, [failed])

  async function beginTransition(kind: 'login' | 'logout') {
    // Commit unmounts before starting a document navigation or clearing cache entries.
    // React may otherwise batch this state update until after location.replace.
    flushSync(() => {
      setLeaving(kind)
      setFailed(false)
    })
    router.clearCache()
    await discardWorkspaceQueries(router.options.context.queryClient)
  }

  async function replaceWorkspace(destination: string) {
    router.clearCache()
    await discardWorkspaceQueries(router.options.context.queryClient)
    // Discard the old JS realm as well as cache entries: late callbacks cannot enter
    // the next account's Router, QueryClient, React state or future map instance.
    window.location.replace(destination)
  }

  async function completeLogin(destination: string) {
    await beginTransition('login')
    await replaceWorkspace(safeReturnTo(destination))
  }

  async function endSession(targetAccount?: string) {
    // Keep the first confirmed intent in the root boundary: the settings dialog
    // is disposed before the request, and the focused retry passes no arguments.
    if (logoutDestination.current === null) {
      const target = resolveDemoAccount(targetAccount)
      logoutDestination.current = target ? `/login?account=${target.id}` : '/login'
    }
    const destination = logoutDestination.current
    try {
      await beginTransition('logout')
      await logoutDemo()
      await replaceWorkspace(destination)
    } catch {
      setFailed(true)
    }
  }

  return (
    <SessionTransition value={{ endSession, completeLogin }}>
      {leaving ? (
        <main
          className="spec02-transition mx-auto my-12 w-[calc(100%-2.5rem)] max-w-lg space-y-6 px-6 py-8 sm:my-20"
          aria-labelledby="session-transition-title"
        >
          <LockKeyhole aria-hidden="true" className="size-8 text-ring" />
          <h1 id="session-transition-title" className="font-display text-3xl font-semibold">
            {leaving === 'logout' ? '正在结束演示会话' : '正在进入演示工作区'}
          </h1>
          {failed ? (
            <>
              <p role="alert">暂时无法确认退出，工作区已隐藏。请重试以结束会话。</p>
              <Button ref={retryRef} onClick={() => void endSession()}>
                重试退出
              </Button>
            </>
          ) : (
            <output aria-live="polite">
              {leaving === 'logout' ? '正在退出登录…' : '正在打开工作区…'}
            </output>
          )}
        </main>
      ) : (
        <Outlet />
      )}
    </SessionTransition>
  )
}
