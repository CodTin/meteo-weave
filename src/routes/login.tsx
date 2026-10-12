import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { EntryShell } from '@/components/entry/entry-shell'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: '登录 · MeteoWeave' }] }),
  component: LoginPage,
})

function LoginPage() {
  return (
    <EntryShell>
      <div className="mx-auto max-w-lg py-4 sm:py-10">
        <p className="mb-3 text-xs tracking-widest text-muted-foreground">平台入口 / 登录</p>
        <h1 className="font-display text-3xl font-semibold">登录 MeteoWeave</h1>
        <p className="mt-3 mb-8 text-sm leading-7 text-muted-foreground">
          这里是气象降尺度演示平台的登录入口。
        </p>
        <Card>
          <CardHeader>
            <LockKeyhole className="mb-2 size-8 text-primary" aria-hidden="true" />
            <CardTitle>认证尚未接入</CardTitle>
            <CardDescription>
              当前仅提供界面预览，暂不支持登录，也不会建立演示会话。请勿在此提交真实账号或密码。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button disabled className="w-full">
              登录暂不可用
            </Button>
            <Link to="/" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
              <ArrowLeft aria-hidden="true" />
              返回平台入口
            </Link>
          </CardContent>
        </Card>
      </div>
    </EntryShell>
  )
}
