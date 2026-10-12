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
      <div className="mx-auto max-w-lg py-4 sm:py-10">
        <p className="mb-3 text-xs tracking-widest text-muted-foreground">平台入口 / 登录</p>
        <h1 className="font-display text-3xl font-semibold">登录 MeteoWeave</h1>
        <p className="mt-3 mb-8 text-sm leading-7 text-muted-foreground">
          {returnTo
            ? '访问工作区需要先登录。请使用下方公开的 Demo 账号继续，登录后将返回目标页面。'
            : '这里是气象降尺度演示平台的登录入口。'}
        </p>
        <Card>
          <CardHeader>
            <LockKeyhole className="mb-2 size-8 text-ring" aria-hidden="true" />
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
    </EntryShell>
  )
}
