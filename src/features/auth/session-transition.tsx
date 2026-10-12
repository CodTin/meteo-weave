import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Outlet, useRouter } from '@tanstack/react-router'
import { safeReturnTo } from '@/features/auth/return-to'
import { discardWorkspaceQueries } from '@/lib/query/client'
import { logoutDemo } from '@/server/functions/demo-session'
import { Button } from '@/components/ui/button'

const SessionTransition = createContext<{
  endSession: () => Promise<void>
  completeLogin: (destination: string) => Promise<void>
} | null>(null)

// One transition for workspace logout and the later confirmed settings switch.
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

  async function endSession() {
    try {
      await beginTransition('logout')
      await logoutDemo()
      await replaceWorkspace('/login')
    } catch {
      setFailed(true)
    }
  }

  return (
    <SessionTransition value={{ endSession, completeLogin }}>
      {leaving ? (
        <main
          className="mx-auto max-w-lg space-y-6 px-6 py-20"
          aria-labelledby="session-transition-title"
        >
          <h1 id="session-transition-title" className="text-2xl font-semibold">
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
