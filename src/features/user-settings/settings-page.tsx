import { Link } from '@tanstack/react-router'
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
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
        后续在这里管理用户角色与分析偏好。当前界面预览没有登录身份，也不读取或保存个人信息。
      </p>
      <Card>
        <CardHeader>
          <LockKeyhole className="mb-2 size-7 text-muted-foreground" aria-hidden="true" />
          <CardTitle>账号与偏好设置尚未接入</CardTitle>
          <CardDescription id="settings-status">
            身份认证接入后才能提供账号与偏好设置。当前无法切换角色或保存设置。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-lg border bg-background p-4">
              <dt className="text-sm font-medium">用户角色</dt>
              <dd className="mt-2 text-sm leading-7 text-muted-foreground">
                尚未接入，不为当前访问者指定研究人员、决策者或农业用户身份。
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
