import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { EntryShell } from '@/components/entry/entry-shell'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RoleDialog } from '@/features/login/role-dialog'
import { ResolutionPreview } from '@/components/entry/resolution-preview'
import { LoginPreview } from '@/features/login/login-preview'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: '登录 · MeteoWeave' }] }),
  component: LoginPage,
})

function LoginPage() {
  return (
    <EntryShell>
      <div className="mx-auto max-w-5xl py-2 sm:py-4">
        <p className="eyebrow mb-4">平台入口 / 登录</p>
        <h1 className="page-heading">登录 MeteoWeave</h1>
        <p className="mt-3 mb-8 text-sm leading-7 text-muted-foreground">
          这里是气象降尺度演示平台的登录入口。
        </p>
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
          <aside className="login-context" aria-labelledby="login-context-title">
            <div>
              <p className="eyebrow mb-5">METEOWEAVE / DEMO</p>
              <h2
                id="login-context-title"
                className="max-w-xs font-display text-3xl leading-relaxed font-semibold"
              >
                从预报网格，
                <br />
                走向局地细节。
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">
                在同一个工作台中，了解降尺度任务的配置、结果对比与分析流程。
              </p>
            </div>
            <ResolutionPreview />
            <p className="border-t pt-5 text-xs leading-6 text-muted-foreground">
              当前为界面预览。图中仅展示分辨率概念，不代表真实数据或计算结果。
            </p>
          </aside>
          <Card className="surface-accent">
            <CardHeader>
              <div className="status-icon">
                <LockKeyhole className="size-5" aria-hidden="true" />
              </div>
              <CardTitle>认证尚未接入</CardTitle>
              <CardDescription id="authentication-boundary">
                当前仅提供界面预览，暂不支持登录，也不会建立演示会话。请勿输入真实账号或密码。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <LoginPreview />
              <RoleDialog />
              <Link to="/" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
                <ArrowLeft aria-hidden="true" />
                返回平台入口
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </EntryShell>
  )
}
