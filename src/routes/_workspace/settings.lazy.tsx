import { createLazyFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/features/user-settings/settings-page'

export const Route = createLazyFileRoute('/_workspace/settings')({ component: SettingsPage })
