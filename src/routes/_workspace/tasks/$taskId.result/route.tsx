import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceError } from '@/components/workspace/workspace-error'
import { WorkspacePending } from '@/components/workspace/workspace-pending'

export const Route = createFileRoute('/_workspace/tasks/$taskId/result')({
  head: () => ({ meta: [{ title: '结果分析 · MeteoWeave' }] }),
  codeSplitGroupings: [],
  pendingMs: 200,
  pendingMinMs: 200,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
})
