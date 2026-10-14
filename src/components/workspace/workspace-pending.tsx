import { useLocation } from '@tanstack/react-router'
import { Clock3 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { getWorkspaceTitle } from '@/components/workspace/workspace-navigation'

export function WorkspacePending() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const title = getWorkspaceTitle(pathname) ?? '页面'

  return (
    <Card className="surface-accent">
      <CardContent>
        <output aria-label="页面加载状态" aria-live="polite" aria-atomic="true" className="block">
          <span className="flex items-center gap-3 font-display text-xl font-semibold">
            <Clock3 className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            正在加载{title}…
          </span>
          <span className="mt-3 block text-sm leading-7 text-muted-foreground">
            正在获取页面所需资源。等待较久时，可通过导航访问其他页面。
          </span>
        </output>
        <div aria-hidden="true" className="mt-8 space-y-5 motion-safe:animate-pulse">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
          <div className="grid grid-cols-3 gap-3 rounded-sm border bg-background p-5">
            <div className="h-32 rounded bg-muted" />
            <div className="h-32 rounded bg-muted" />
            <div className="h-32 rounded bg-muted" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
