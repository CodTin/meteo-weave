import { Link, useRouteContext } from '@tanstack/react-router'
import { RoleSwitchDialog } from '@/features/user-settings/role-switch-dialog'
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
        这里显示当前演示账号与角色，不收集真实个人信息。切换角色需先退出并重新登录；分析偏好尚未开放。
      </p>
      <Card>
        <CardHeader>
          <CardTitle>演示角色与分析偏好</CardTitle>
          <CardDescription id="settings-status">
            演示身份由统一账号目录解析。角色选择不会直接改变身份；分析偏好暂不支持保存。
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
                尚未接入，不保存分析偏好。
              </dd>
            </div>
          </dl>
        </CardContent>
        <CardFooter className="flex-wrap">
          {account && <RoleSwitchDialog account={account} />}
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
