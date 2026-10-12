import { Link, useRouteContext } from '@tanstack/react-router'
import { LockKeyhole } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function SettingsPage() {
  const { account } = useRouteContext({ from: '/_workspace' })
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
        这里显示当前演示账号与角色，不收集真实个人信息。角色切换与分析偏好将在后续开放。
      </p>
      <Card>
        <CardHeader>
          <LockKeyhole className="mb-2 size-7 text-muted-foreground" aria-hidden="true" />
          <CardTitle>角色切换与偏好设置尚未接入</CardTitle>
          <CardDescription id="settings-status">
            演示身份由统一账号目录解析。当前无法切换角色或保存设置。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-lg border bg-background p-4">
              <dt className="text-sm font-medium">用户角色</dt>
              <dd className="mt-2 text-sm leading-7 text-muted-foreground">
                {account ? (
                  <>
                    <span className="block">
                      {account.name} · {account.id}
                    </span>
                    <span>
                      {account.roleLabel} · {account.roleTitle}
                    </span>
                  </>
                ) : (
                  '未登录，请使用公开演示账号登录后查看身份。'
                )}
              </dd>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <dt className="text-sm font-medium">分析偏好</dt>
              <dd className="mt-2 text-sm leading-7 text-muted-foreground">
                尚未接入，当前预览不会存储配置或覆盖个人偏好。
              </dd>
            </div>
          </dl>
        </CardContent>
        <CardFooter className="flex-wrap">
          <Button disabled aria-describedby="settings-status">
            保存设置
          </Button>
          <Link to="/dashboard" className={buttonVariants({ variant: 'outline' })}>
            返回 Dashboard
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
