import { useCallback, useEffect, useState } from 'react'
import { estimateExportFn } from '@/server/functions/csv-export'
import type {
  ExportEstimationSuccess,
  ExportRequest,
} from '@/features/result-analysis/types/export'
import { ExportRequestIdentity, exportRequestKey, validateExportSelection } from './use-csv-export'

type EstimateSnapshot = {
  identity: number
  estimation: ExportEstimationSuccess | null
  isEstimating: boolean
  error: string | null
  code: string | null
}

/** Estimates and downloads share the same full request, validation preview and identity key. */
export function useExportEstimation(request: ExportRequest, debounceMs = 300) {
  const key = exportRequestKey(request)
  const [attempt, setAttempt] = useState(0)
  const [scope] = useState(() => new ExportRequestIdentity(request))
  const [snapshot, setSnapshot] = useState<EstimateSnapshot>({
    identity: 0,
    estimation: null,
    isEstimating: false,
    error: null,
    code: null,
  })
  scope.select(request)
  const validation = validateExportSelection(request)

  useEffect(() => {
    const selection = structuredClone(scope.request)
    const failure = validateExportSelection(selection)
    if (failure) return
    const operation = scope.begin()
    const { identity, controller } = operation
    const initial: EstimateSnapshot = {
      identity,
      estimation: null,
      isEstimating: true,
      error: null,
      code: null,
    }
    const current = () => scope.owns(operation)
    const timer = setTimeout(async () => {
      try {
        const reply = await estimateExportFn({ data: selection, signal: controller.signal })
        if (!current()) return
        if (!reply.ok) {
          setSnapshot({ ...initial, isEstimating: false, error: reply.message, code: reply.code })
        } else {
          if (
            !Number.isSafeInteger(reply.recordCount) ||
            reply.recordCount <= 0 ||
            !Number.isFinite(reply.approximateSize) ||
            reply.approximateSize <= 0 ||
            typeof reply.identity !== 'string' ||
            !reply.identity ||
            typeof reply.sizeRule !== 'string' ||
            !Array.isArray(reply.counts) ||
            !Array.isArray(reply.notes)
          )
            throw new Error('服务器未返回有效估算，请重试。')
          setSnapshot({ ...initial, estimation: reply, isEstimating: false })
        }
      } catch (error) {
        if (!current()) return
        setSnapshot({
          ...initial,
          isEstimating: false,
          code: 'ESTIMATION_FAILED',
          error: error instanceof Error ? error.message : '估算失败，请重试。',
        })
      }
    }, debounceMs)
    operation.dispose = () => clearTimeout(timer)
    return () => {
      clearTimeout(timer)
      controller.abort()
      scope.settle(operation)
    }
  }, [key, scope, debounceMs, attempt])

  const retry = useCallback(() => {
    scope.retire()
    setAttempt((previous) => previous + 1)
  }, [scope])

  // Clear old records/notes/identity during render, before any debounce or late response.
  const visible =
    snapshot.identity === scope.identity
      ? snapshot
      : {
          identity: scope.identity,
          estimation: null,
          isEstimating: true,
          error: null,
          code: null,
        }
  if (visible !== snapshot) setSnapshot(visible)
  if (validation)
    return {
      estimation: null,
      isEstimating: false,
      error: validation.message,
      code: validation.code,
      retry,
    }
  return { ...visible, isEstimating: !visible.estimation && !visible.error, retry }
}
