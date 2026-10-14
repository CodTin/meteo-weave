import { demoAccounts } from '@/features/auth/demo-accounts'

export function RoleDescriptions() {
  return (
    <dl className="divide-y text-sm leading-7">
      {demoAccounts.map((account) => (
        <div key={account.id} className="py-4 first:pt-0 last:pb-0">
          <dt className="font-medium text-foreground">
            {account.roleLabel}（{account.roleTitle}）
          </dt>
          <dd className="text-muted-foreground">{account.description}</dd>
        </div>
      ))}
    </dl>
  )
}
