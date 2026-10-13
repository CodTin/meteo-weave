import { demoAccounts } from '@/features/auth/demo-accounts'

export function RoleDescriptions() {
  return (
    <dl className="space-y-4 text-sm leading-7">
      {demoAccounts.map((account) => (
        <div key={account.id}>
          <dt className="font-medium text-foreground">
            {account.roleLabel}（{account.roleTitle}）
          </dt>
          <dd className="text-muted-foreground">{account.description}</dd>
        </div>
      ))}
    </dl>
  )
}
