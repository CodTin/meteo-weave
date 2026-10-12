import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceShell } from '@/components/workspace/workspace-shell'

export const Route = createFileRoute('/_workspace')({ component: WorkspaceShell })
