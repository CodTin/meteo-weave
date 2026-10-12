import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/features/user-settings/settings-page'

export const Route = createFileRoute('/_workspace/settings')({
  head: () => ({ meta: [{ title: '设置 · MeteoWeave' }] }),
  component: SettingsPage,
})
