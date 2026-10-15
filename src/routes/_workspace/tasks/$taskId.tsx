import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceError } from '@/components/workspace/workspace-error'
import { WorkspacePending } from '@/components/workspace/workspace-pending'

export const Route = createFileRoute('/_workspace/tasks/$taskId')({
  head: () => ({ meta: [{ title: '任务结果 · MeteoWeave' }] }),
  codeSplitGroupings: [],
  pendingMs: 200,
  pendingMinMs: 200,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
})
