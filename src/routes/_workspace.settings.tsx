import { createFileRoute } from '@tanstack/react-router'
import { WorkspacePending } from '@/components/workspace/workspace-pending'
import { WorkspaceError } from '@/components/workspace/workspace-error'

export const Route = createFileRoute('/_workspace/settings')({
  head: () => ({ meta: [{ title: '设置 · MeteoWeave' }] }),
  // Keep recovery UI available even when the separately loaded page is unavailable.
  codeSplitGroupings: [],
  pendingMs: 200,
  pendingMinMs: 200,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
})
