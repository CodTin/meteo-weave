import { createLazyFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/features/dashboard/dashboard-page'

export const Route = createLazyFileRoute('/_workspace/dashboard')({ component: DashboardPage })
