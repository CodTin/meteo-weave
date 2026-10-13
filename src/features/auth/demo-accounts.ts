// Public fixtures, not credentials for real users. Never use this catalog for real data access.
export const DEMO_PASSWORD = 'meteo-demo'

export const demoAccounts = [
  {
    id: 'researcher',
    name: '研究演示账号',
    role: 'researcher',
    roleLabel: '研究人员',
    roleTitle: 'Researcher',
    description: '关注技术指标、模型细节与完整参数控制。',
  },
  {
    id: 'policy',
    name: '决策演示账号',
    role: 'policy',
    roleLabel: '决策者',
    roleTitle: 'Policy Maker',
    description: '关注应用场景、决策支持信息与中等参数权限。',
  },
  {
    id: 'agriculture',
    name: '农业演示账号',
    role: 'agriculture',
    roleLabel: '农业用户',
    roleTitle: 'Agriculture User',
    description: '关注农业相关气象指标与中等参数权限。',
  },
] as const

export type DemoAccount = (typeof demoAccounts)[number]

export function resolveDemoAccount(id: unknown): DemoAccount | null {
  return demoAccounts.find((account) => account.id === id) ?? null
}
