import { AccountMark } from '@/features/auth/account-mark'
import { demoAccounts } from '@/features/auth/demo-accounts'

export function RoleDescriptions() {
  return (
    <dl className="space-y-4 text-sm leading-7">
      {demoAccounts.map((account) => (
        <div key={account.id} className="relative border-b pb-4 pl-14 last:border-b-0 last:pb-0">
          <dt className="font-display text-lg font-semibold text-foreground">
            <AccountMark account={account} className="absolute top-0 left-0" />
            {account.roleLabel}（{account.roleTitle}）
          </dt>
          <dd className="mt-1 text-muted-foreground">{account.description}</dd>
        </div>
      ))}
    </dl>
  )
}
