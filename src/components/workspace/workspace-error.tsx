import { Link, useLocation, type ErrorComponentProps } from '@tanstack/react-router'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { workspacePages } from '@/components/workspace/workspace-navigation'

export function WorkspaceError({ error }: ErrorComponentProps) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const title =
    workspacePages.find((page) => page.path === pathname.replace(/\/$/, ''))?.title ?? '页面'
  // Classify only; never render the raw message, URL, response or stack.
  const resourceFailed =
    error instanceof Error &&
    [
      'Failed to fetch dynamically imported module',
      'error loading dynamically imported module',
      'Importing a module script failed',
    ].some((prefix) => error.message.startsWith(prefix))

  return (
    <Card>
      <CardHeader role="alert" aria-atomic="true">
        <AlertTriangle className="size-7 text-destructive" aria-hidden="true" />
        <CardTitle>{title}暂时无法打开</CardTitle>
        <CardDescription>
          {resourceFailed ? '页面资源未能加载。' : '页面内容未能正常显示。'}
          请检查网络连接后重新加载；如果问题持续，可先返回平台入口。
        </CardDescription>
        <CardDescription>
          重新加载会刷新整个页面，不会提交任务或修改设置。也可以通过工作区导航访问其他页面。
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-wrap">
        <Button onClick={() => window.location.reload()}>
          <RotateCcw aria-hidden="true" /> 重新加载当前页
        </Button>
        <Link to="/" className={buttonVariants({ variant: 'outline' })}>
          返回平台入口
        </Link>
      </CardFooter>
    </Card>
  )
}
