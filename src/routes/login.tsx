import { ResolutionPreview } from '@/components/entry/resolution-preview'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { EntryShell } from '@/components/entry/entry-shell'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { demoAccounts, DEMO_PASSWORD, resolveDemoAccount } from '@/features/auth/demo-accounts'
import { RoleDialog } from '@/features/login/role-dialog'
import { LoginPreview } from '@/features/login/login-preview'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    returnTo: z.string().optional().catch(undefined),
    account: z
      .unknown()
      .transform((value) => resolveDemoAccount(value)?.id)
      .optional(),
  }),
  head: () => ({ meta: [{ title: '登录 · MeteoWeave' }] }),
  component: LoginPage,
})

function LoginPage() {
  const { returnTo, account } = Route.useSearch()
  return (
    <EntryShell>
      <div className="mx-auto max-w-5xl py-2 sm:py-4">
        <p className="eyebrow mb-4">平台入口 / 登录</p>
        <h1 className="page-heading">登录 MeteoWeave</h1>
        <p className="mt-3 mb-8 text-sm leading-7 text-muted-foreground">
          {returnTo
            ? '访问工作区需要先登录。请使用下方公开的 Demo 账号继续，登录后将返回目标页面。'
            : '这里是气象降尺度演示平台的登录入口。'}
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
                使用公开演示账号，了解降尺度任务的配置、结果对比与分析流程。
              </p>
            </div>
            <ResolutionPreview />
            <p className="border-t pt-5 text-xs leading-6 text-muted-foreground">
              当前仅用于合成 Demo 数据与流程演示。图中仅展示分辨率概念，不代表真实数据或计算结果。
            </p>
          </aside>
          <Card className="surface-accent">
            <CardHeader>
              <div className="status-icon">
                <LockKeyhole className="size-5" aria-hidden="true" />
              </div>
              <CardTitle>Demo 账号登录</CardTitle>
              <CardDescription id="authentication-boundary">
                仅使用下方公开的演示信息。请勿输入真实账号、个人信息或真实密码；不提供注册。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <section
                aria-label="公开演示账号"
                id="demo-credentials"
                className="space-y-3 rounded-lg border bg-muted p-4 text-sm leading-7"
              >
                <h2 className="font-medium">公开演示账号</h2>
                <ul className="space-y-2">
                  {demoAccounts.map((account) => (
                    <li key={account.id}>
                      <code>{account.id}</code> — {account.name} / {account.roleLabel}（
                      {account.roleTitle}）
                    </li>
                  ))}
                </ul>
                <p>
                  以上账号的公开演示密码均为 <code>{DEMO_PASSWORD}</code>
                  。填写账号标识和演示密码后登录，默认进入 Dashboard。
                </p>
                <p className="text-xs text-muted-foreground">
                  会话仅记录公开账号标识，并非生产认证或防篡改机制。只能用于合成 Demo
                  数据，不能用于真实用户或远程数据授权。
                </p>
              </section>
              <LoginPreview key={account ?? 'unselected'} preselectedAccount={account} />
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
