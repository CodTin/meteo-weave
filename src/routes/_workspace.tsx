import { createFileRoute } from '@tanstack/react-router'
import { requireDemoSession } from '@/server/functions/demo-session'
import { WorkspaceShell } from '@/components/workspace/workspace-shell'

export const Route = createFileRoute('/_workspace')({
  // Navigation and lifecycle chrome must not depend on a page chunk arriving.
  codeSplitGroupings: [],
  beforeLoad: async ({ location, abortController }) => ({
    account: await requireDemoSession({ data: location.href, signal: abortController.signal }),
  }),
  component: WorkspaceShell,
})
