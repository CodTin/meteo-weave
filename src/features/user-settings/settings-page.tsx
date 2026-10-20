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
import { AccountMark } from '@/features/auth/account-mark'
import { RoleSwitchDialog } from './role-switch-dialog'
import { DemoRecoveryDialog } from './demo-recovery-dialog'

export function SettingsPage() {
  const { account } = useRouteContext({ from: '/_workspace' })
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
        这里显示当前演示账号与角色，不收集真实个人信息。切换角色需先退出并重新登录；分析偏好尚未开放。
      </p>
      <Card className="spec02-panel">
        <CardHeader>
          <CardTitle className="text-2xl">演示角色与分析偏好</CardTitle>
          <CardDescription id="settings-status">
            演示身份由统一账号目录解析。角色选择不会直接改变身份；分析偏好暂不支持保存。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            <div className="spec02-settings-identity rounded-lg border bg-background p-4">
              <dt className="spec02-setting-label text-sm font-medium">
                用户角色
                {account && <span className="spec02-status-tag">当前会话</span>}
              </dt>
              <dd className="mt-3 text-sm leading-7 text-muted-foreground">
                {account ? (
                  <div className="flex items-center gap-3">
                    <AccountMark account={account} />
                    <div className="min-w-0">
                      <span className="block text-foreground">
                        {account.roleLabel}{' '}
                        <span className="text-xs text-muted-foreground">· {account.roleTitle}</span>
                      </span>
                      <span className="block text-xs">
                        {account.name} · <code className="font-mono">{account.id}</code>
                      </span>
                    </div>
                  </div>
                ) : (
                  '未登录，请使用公开演示账号登录后查看身份。'
                )}
              </dd>
            </div>
            <div className="rounded-lg border border-dashed bg-background/40 p-4">
              <dt className="spec02-setting-label text-sm font-medium">
                分析偏好 <LockKeyhole aria-hidden="true" className="size-4 text-muted-foreground" />
              </dt>
              <dd className="mt-3 text-sm leading-7 text-muted-foreground">
                尚未接入，不保存分析偏好。
              </dd>
            </div>
          </dl>
        </CardContent>
        <CardFooter className="flex-wrap gap-2 border-t pt-6">
          {account && (
            <>
              <RoleSwitchDialog account={account} />
              <DemoRecoveryDialog account={account} />
            </>
          )}
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
