import { FlaskConical, Landmark, Sprout } from 'lucide-react'
import type { DemoAccount } from './demo-accounts'
import { cn } from '@/lib/utils'
import '@/styles/spec02.css'

const roleIcons = { researcher: FlaskConical, policy: Landmark, agriculture: Sprout }

// A visual cue only. Identity and capabilities still come from the canonical account directory.
export function AccountMark({ account, className }: { account: DemoAccount; className?: string }) {
  const Icon = roleIcons[account.role]
  return (
    <span aria-hidden="true" className={cn('spec02-account-mark', className)}>
      <Icon />
    </span>
  )
}
