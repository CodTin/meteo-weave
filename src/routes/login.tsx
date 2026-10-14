import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { ArrowLeft, LockKeyhole, KeyRound } from 'lucide-react'
import { EntryShell } from '@/components/entry/entry-shell'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { demoAccounts, DEMO_PASSWORD, resolveDemoAccount } from '@/features/auth/demo-accounts'
import { AccountMark } from '@/features/auth/account-mark'
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
      <div className="spec02-access">
        <div className="spec02-access-grid">
          <div>
            <p className="spec02-eyebrow">METEOWEAVE / DEMO ACCESS</p>
            <h1 className="spec02-access-title font-display">登录 MeteoWeave</h1>
            <p className="spec02-access-lead">
              {returnTo
                ? '访问工作区需要先登录。请使用下方公开的 Demo 账号继续，登录后将返回目标页面。'
                : '从研究、决策或农业的视角，探索气象降尺度。选择一个公开演示账号，进入你的工作区。'}
            </p>
            <section aria-label="公开演示账号" id="demo-credentials" className="spec02-directory">
              <div className="spec02-directory-heading">
                <h2 className="text-sm font-medium">公开演示账号</h2>
                <span className="font-mono text-xs tracking-widest text-muted-foreground">
                  DEMO ONLY
                </span>
              </div>
              <ul className="spec02-directory-list">
                {demoAccounts.map((candidate) => (
                  <li key={candidate.id} className="spec02-directory-row">
                    <AccountMark account={candidate} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {candidate.roleLabel}{' '}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {candidate.roleTitle}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{candidate.name}</p>
                    </div>
                    <code className="font-mono text-xs text-foreground">{candidate.id}</code>
                  </li>
                ))}
              </ul>
              <div className="spec02-password-note">
                <span className="flex items-center gap-2">
                  <KeyRound aria-hidden="true" className="size-4" />
                  统一演示密码
                </span>
                <code>{DEMO_PASSWORD}</code>
              </div>
              <p className="mt-4 max-w-[48ch] text-xs leading-6 text-muted-foreground">
                会话仅记录公开账号标识，并非生产认证或防篡改机制。只能用于合成 Demo
                数据，不能用于真实用户或远程数据授权。
              </p>
            </section>
          </div>
          <Card className="spec02-panel spec02-login-panel">
            <CardHeader>
              <p className="spec02-eyebrow">
                <LockKeyhole aria-hidden="true" className="size-3.5" />
                工作区入口
              </p>
              <CardTitle>Demo 账号登录</CardTitle>
              <CardDescription id="authentication-boundary">
                仅使用公开的演示信息。请勿输入真实账号、个人信息或真实密码；不提供注册。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginPreview key={account ?? 'unselected'} preselectedAccount={account} />
              <div className="space-y-3 border-t pt-5">
                <RoleDialog />
                <Link
                  to="/"
                  className={buttonVariants({
                    variant: 'ghost',
                    className: 'w-full text-muted-foreground',
                  })}
                >
                  <ArrowLeft aria-hidden="true" />
                  返回平台入口
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </EntryShell>
  )
}
