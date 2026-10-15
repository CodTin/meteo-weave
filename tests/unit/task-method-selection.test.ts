import { describe, expect, it } from 'vitest'
import { checkDownscalingConfiguration } from '@/features/downscaling-tasks/configuration-admission'
import type { DemoAccount } from '@/features/auth/demo-accounts'

const baseConfig = {
  name: '测试任务',
  dataSource: 'fusion' as const,
  variable: 'temperature' as const,
  region: { west: 110, east: 111, south: 30, north: 31 },
  timeRange: { mode: 'historical' as const, start: '2024-01-01', end: '2024-01-01' },
  resolution: '3km' as const,
}

const researcherAccount: DemoAccount = {
  id: 'researcher',
  name: '研究演示账号',
  role: 'researcher',
  roleLabel: '研究人员',
  roleTitle: 'Researcher',
  description: '关注技术指标、模型细节与完整参数控制。',
}

const policyAccount: DemoAccount = {
  id: 'policy',
  name: '决策演示账号',
  role: 'policy',
  roleLabel: '决策者',
  roleTitle: 'Policy Maker',
  description: '关注应用场景、决策支持信息与中等参数权限。',
}

const agricultureAccount: DemoAccount = {
  id: 'agriculture',
  name: '农业演示账号',
  role: 'agriculture',
  roleLabel: '农业用户',
  roleTitle: 'Agriculture User',
  description: '关注农业相关气象指标与中等参数权限。',
}

describe('Method selection and resolution', () => {
  describe('Recommended method resolution', () => {
    it('defaults to deterministic when no uncertainty quantification', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'recommended',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.configuration.method).toBe('recommended')
        expect(result.configuration.resolvedMethod).toBe('deterministic')
      }
    })

    it('resolves to probabilistic when uncertainty quantification is enabled', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'recommended',
        advanced: {
          uncertaintyQuantification: true,
        },
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.configuration.method).toBe('recommended')
        expect(result.configuration.resolvedMethod).toBe('probabilistic')
        expect(result.configuration.advanced?.uncertaintyQuantification).toBe(true)
        expect(result.configuration.advanced?.ensembleMembers).toBe(10)
      }
    })

    it('allows custom ensemble members with uncertainty quantification', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'recommended',
        advanced: {
          uncertaintyQuantification: true,
          ensembleMembers: 20,
        },
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.configuration.resolvedMethod).toBe('probabilistic')
        expect(result.configuration.advanced?.ensembleMembers).toBe(20)
      }
    })
  })

  describe('Explicit deterministic method', () => {
    it('accepts deterministic without advanced parameters', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'deterministic',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.configuration.method).toBe('deterministic')
        expect(result.configuration.resolvedMethod).toBe('deterministic')
        expect(result.configuration.advanced).toBeUndefined()
      }
    })

    it('rejects deterministic with uncertainty quantification enabled', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'deterministic',
        advanced: {
          uncertaintyQuantification: true,
        },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('INCOMPATIBLE_METHOD')
        expect(result.error).toContain('确定性输出不能使用不确定性量化')
      }
    })

    it('rejects deterministic with ensemble members', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'deterministic',
        advanced: {
          uncertaintyQuantification: false,
          ensembleMembers: 10,
        },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('INCOMPATIBLE_METHOD')
      }
    })
  })

  describe('Explicit probabilistic method', () => {
    it('accepts probabilistic with default ensemble members', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'probabilistic',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.configuration.method).toBe('probabilistic')
        expect(result.configuration.resolvedMethod).toBe('probabilistic')
        expect(result.configuration.advanced?.ensembleMembers).toBe(10)
      }
    })

    it('accepts probabilistic with 5 ensemble members', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'probabilistic',
        advanced: {
          ensembleMembers: 5,
        },
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.configuration.advanced?.ensembleMembers).toBe(5)
      }
    })

    it('accepts probabilistic with 10 ensemble members', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'probabilistic',
        advanced: {
          ensembleMembers: 10,
        },
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.configuration.advanced?.ensembleMembers).toBe(10)
      }
    })

    it('accepts probabilistic with 20 ensemble members', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'probabilistic',
        advanced: {
          ensembleMembers: 20,
        },
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.configuration.advanced?.ensembleMembers).toBe(20)
      }
    })

    it('rejects probabilistic with invalid ensemble member count', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'probabilistic',
        advanced: {
          ensembleMembers: 15,
        },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('INVALID_CONFIGURATION')
      }
    })
  })

  describe('Role-based method restrictions', () => {
    it('allows researcher to use deterministic method', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'deterministic',
      })
      expect(result.ok).toBe(true)
    })

    it('allows researcher to use probabilistic method', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'probabilistic',
      })
      expect(result.ok).toBe(true)
    })

    it('allows researcher to use recommended method', () => {
      const result = checkDownscalingConfiguration(researcherAccount, {
        ...baseConfig,
        method: 'recommended',
      })
      expect(result.ok).toBe(true)
    })

    it('rejects policy maker using deterministic method', () => {
      const result = checkDownscalingConfiguration(policyAccount, {
        ...baseConfig,
        method: 'deterministic',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('ROLE_RESTRICTED')
        expect(result.error).toContain('当前角色仅可使用推荐方法')
      }
    })

    it('rejects policy maker using probabilistic method', () => {
      const result = checkDownscalingConfiguration(policyAccount, {
        ...baseConfig,
        method: 'probabilistic',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('ROLE_RESTRICTED')
      }
    })

    it('allows policy maker to use recommended method', () => {
      const result = checkDownscalingConfiguration(policyAccount, {
        ...baseConfig,
        method: 'recommended',
      })
      expect(result.ok).toBe(true)
    })

    it('rejects policy maker using advanced parameters', () => {
      const result = checkDownscalingConfiguration(policyAccount, {
        ...baseConfig,
        method: 'recommended',
        advanced: {
          uncertaintyQuantification: true,
        },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('ROLE_RESTRICTED')
        expect(result.error).toContain('不能覆盖研究专属方法或高级参数')
      }
    })

    it('rejects agriculture user using deterministic method', () => {
      const result = checkDownscalingConfiguration(agricultureAccount, {
        ...baseConfig,
        method: 'deterministic',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('ROLE_RESTRICTED')
      }
    })

    it('allows agriculture user to use recommended method', () => {
      const result = checkDownscalingConfiguration(agricultureAccount, {
        ...baseConfig,
        method: 'recommended',
      })
      expect(result.ok).toBe(true)
    })
  })
})
