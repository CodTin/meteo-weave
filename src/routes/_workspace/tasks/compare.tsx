import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { WorkspaceError } from '@/components/workspace/workspace-error'
import { WorkspacePending } from '@/components/workspace/workspace-pending'

export const Route = createFileRoute('/_workspace/tasks/compare')({
  // Keep invalid selections recoverable; the hydrated page validates the persisted A/B pair.
  validateSearch: z.object({
    a: z.string().min(1).max(128).optional().catch(undefined),
    b: z.string().min(1).max(128).optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: '任务对比 · MeteoWeave' }] }),
  // Keep recovery UI available even when the separately loaded page is unavailable.
  codeSplitGroupings: [],
  pendingMs: 200,
  pendingMinMs: 200,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
})
