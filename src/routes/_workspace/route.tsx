import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceShell } from '@/components/workspace/workspace-shell'

export const Route = createFileRoute('/_workspace')({
  // Navigation and lifecycle chrome must not depend on a page chunk arriving.
  codeSplitGroupings: [],
  component: WorkspaceShell,
})
