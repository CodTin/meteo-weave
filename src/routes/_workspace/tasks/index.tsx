import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceError } from '@/components/workspace/workspace-error'
import { WorkspacePending } from '@/components/workspace/workspace-pending'

export const Route = createFileRoute('/_workspace/tasks/')({
  head: () => ({ meta: [{ title: '任务管理 · MeteoWeave' }] }),
  // Keep recovery UI available even when the separately loaded page is unavailable.
  codeSplitGroupings: [],
  pendingMs: 200,
  pendingMinMs: 200,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
})
