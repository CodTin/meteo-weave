import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isRedirect, redirect, useRouteContext, useRouter } from '@tanstack/react-router'
import { safeReturnTo } from '@/features/auth/return-to'
import { createTaskService } from '@/features/downscaling-tasks/service'
import { sameTaskMetadata } from '@/features/downscaling-tasks/service/record-validation'
import { onWorkspaceDiscard } from '@/lib/query/client'
import { queryTaskComparison } from '../service'
import { queryComparisonMapPreviews } from '../maps'
import { pairRecovery } from './messages'

export function useComparisonPage(a: string | undefined, b: string | undefined) {
  const client = useQueryClient()
  const router = useRouter()
  const { account } = useRouteContext({ from: '/_workspace' })
  const valid = !!a && !!b && a !== b && a.trim() === a && b.trim() === b
  const [attempt, setAttempt] = useState(0)
  const bootKey = `${account.id}:${valid}:${attempt}`
  const [boot, setBoot] = useState<{
    ready: boolean
    key: string
    service: ReturnType<typeof createTaskService> | null
    error: boolean
  }>({ ready: false, key: '', service: null, error: false })

  useEffect(() => {
    let active = true
    // Browser storage and its task service are never initialized by SSR.
    // Inner task queries also use the workspace QueryClient, whose Router integration
    // handles redirects before the outer page query can catch them. Preserve this
    // comparison destination at the public RPC boundary, not in a global auth rule.
    async function withReturnTo<T>(request: () => Promise<T>): Promise<T> {
      // Concurrent late redirects must not replace the pair with an already-entered login URL.
      const returnTo = safeReturnTo(router.state.location.href)
      try {
        return await request()
      } catch (error) {
        if (active && isRedirect(error) && error.options.href) {
          const destination = new URL(error.options.href, window.location.origin)
          if (destination.origin === window.location.origin && destination.pathname === '/login') {
            destination.searchParams.set('returnTo', returnTo)
            // Router resolves Response Location before options.href; construct one
            // consistent public redirect instead of mutating only half of the response.
            throw redirect({
              href: `${destination.pathname}${destination.search}${destination.hash}`,
              replace: true,
            })
          }
        }
        throw error
      }
    }
    const service = valid
      ? createTaskService({
          queryClient: client,
          transport: {
            account: () =>
              withReturnTo(async () =>
                (await import('@/server/functions/demo-session')).requireDemoSession({
                  data: safeReturnTo(router.state.location.href),
                }),
              ),
            catalog: () =>
              withReturnTo(async () =>
                (await import('@/server/functions/downscaling-tasks')).getTaskCatalog(),
              ),
            read: (data) =>
              withReturnTo(async () =>
                (await import('@/server/functions/downscaling-tasks')).readTask({ data }),
              ),
            result: (data) =>
              withReturnTo(async () =>
                (await import('@/server/functions/downscaling-tasks')).queryTaskResult({ data }),
              ),
            submit: (data) =>
              withReturnTo(async () =>
                (await import('@/server/functions/downscaling-tasks')).submitTask({ data }),
              ),
            restore: (data) =>
              withReturnTo(async () =>
                (await import('@/server/functions/downscaling-tasks')).restoreTask({ data }),
              ),
          },
        })
      : null
    const unsubscribe = onWorkspaceDiscard(client, () => {
      active = false
      setBoot({ ready: false, key: bootKey, service: null, error: false })
      service?.close()
    })
    void (service?.initialize() ?? Promise.resolve()).then(
      () => {
        if (active) setBoot({ ready: true, key: bootKey, service, error: false })
      },
      (error: unknown) => {
        if (!active) return
        if (isRedirect(error)) {
          setBoot({ ready: false, key: bootKey, service: null, error: false })
          void router.invalidate()
        } else setBoot({ ready: true, key: bootKey, service: null, error: true })
      },
    )
    return () => {
      active = false
      unsubscribe()
      service?.close()
    }
  }, [client, router, bootKey, valid])

  const query = useQuery({
    // Public task mutations invalidate this observer along with the task list.
    queryKey: ['downscaling-tasks', 'comparison-page', account.id, a, b, attempt],
    enabled: valid && boot.key === bootKey && boot.service !== null,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      const service = boot.service
      if (!service || !a || !b) throw new Error('Comparison is not initialized.')
      const comparison = await queryTaskComparison(service, { a, b })
      if (!comparison.ok)
        return {
          status: 'error' as const,
          message: pairRecovery(comparison.failures[0]?.code ?? comparison.code),
        }
      const maps = await queryComparisonMapPreviews(service, {
        a: comparison.tasks[0],
        b: comparison.tasks[1],
      })
      if (!maps.ok) return { status: 'error' as const, message: pairRecovery(maps.code) }

      // Q may return early, or an id may have been deleted/restored during its reads.
      // Publish ONLY when both current records agree with BOTH completed operations.
      const current = await Promise.all([service.get(a), service.get(b)])
      for (const [index, reply] of current.entries()) {
        if (!reply.ok) return { status: 'error' as const, message: pairRecovery(reply.code) }
        if (reply.task.ownerId !== account.id || reply.task.status !== 'Completed')
          return { status: 'error' as const, message: pairRecovery('INVALID_STATUS') }
        if (
          !sameTaskMetadata(reply.task, comparison.tasks[index]!) ||
          !sameTaskMetadata(reply.task, maps.previews[index]!.task)
        )
          return { status: 'error' as const, message: pairRecovery('RECORD_CHANGED') }
      }
      if (signal.aborted) throw new Error('Comparison was discarded.')
      return { status: 'success' as const, comparison, maps }
    },
  })

  const { refetch } = query
  useEffect(() => {
    if (boot.key !== bootKey || !boot.service || !valid) return
    const revalidate = () => {
      if (document.visibilityState === 'visible') void refetch({ cancelRefetch: false })
    }
    window.addEventListener('focus', revalidate)
    window.addEventListener('pageshow', revalidate)
    return () => {
      window.removeEventListener('focus', revalidate)
      window.removeEventListener('pageshow', revalidate)
    }
  }, [boot.key, bootKey, boot.service, valid, refetch])

  const retry = () => {
    if (boot.service?.getState() === 'ready') void refetch({ cancelRefetch: false })
    else setAttempt((value) => value + 1)
  }
  // Do not keep old names, parameters, maps or metrics visible during revalidation/failure.
  if (boot.key !== bootKey || !boot.ready || query.isFetching)
    return { status: 'loading' as const, retry }
  if (!valid) return { status: 'error' as const, message: pairRecovery('INVALID_PAIR'), retry }
  if (boot.error || query.isError)
    return { status: 'error' as const, message: pairRecovery('READ_FAILED'), retry }
  if (!query.data) return { status: 'loading' as const, retry }
  return { ...query.data, retry }
}
