import type { DemoAccount } from '@/features/auth/demo-accounts'

export type DownscalingMethod = 'recommended' | 'deterministic' | 'probabilistic'

// Presentation and admission share this policy; account must come from the Demo session.
export function getDownscalingCapabilities(account: DemoAccount) {
  const allowsAdvanced = account.role === 'researcher'
  const methods: readonly DownscalingMethod[] = allowsAdvanced
    ? ['recommended', 'deterministic', 'probabilistic']
    : ['recommended']
  return { methods, allowsAdvanced }
}
