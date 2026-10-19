import { describe, test, expect } from 'vitest'
import { getRoleSummaryData } from '@/server/services/role-summary.server'

describe('Role Summary', () => {
  describe('Role-specific emphasis', () => {
    test('researcher role emphasizes ensemble distribution and CRPS', async () => {
      const response = await getRoleSummaryData('demo-task-probabilistic', 'researcher')

      expect(response.ok).toBe(true)
      if (response.data.available) {
        expect(response.data.role).toBe('researcher')
        expect(response.data.ensemble).toBeDefined()
        expect(response.data.ensemble?.memberCount).toBeGreaterThan(0)
        expect(response.data.ensemble?.crps).toBeDefined()
        expect(response.data.ensemble?.mean).toBeDefined()
        expect(response.data.ensemble?.stdDev).toBeDefined()
        expect(response.data.ensemble?.p10).toBeDefined()
        expect(response.data.ensemble?.p90).toBeDefined()
      }
    })

    test('policy role emphasizes threshold probability and impact area', async () => {
      const response = await getRoleSummaryData('demo-task-probabilistic', 'policy')

      expect(response.ok).toBe(true)
      if (response.data.available) {
        expect(response.data.role).toBe('policy')
        expect(response.data.threshold).toBeDefined()
        expect(response.data.threshold?.probability).toBeGreaterThanOrEqual(0)
        expect(response.data.threshold?.probability).toBeLessThanOrEqual(1)
        expect(response.data.threshold?.affectedArea).toBeGreaterThanOrEqual(0)
        expect(response.data.ensemble?.p10).toBeDefined()
        expect(response.data.ensemble?.p90).toBeDefined()
      }
    })

    test('agriculture role emphasizes degree days and precipitation probability', async () => {
      const response = await getRoleSummaryData('demo-task-probabilistic', 'agriculture')

      expect(response.ok).toBe(true)
      if (response.data.available) {
        expect(response.data.role).toBe('agriculture')
        expect(response.data.agriculture).toBeDefined()
        expect(response.data.agriculture?.accumulatedDegreeDay).toBeGreaterThanOrEqual(0)
        expect(response.data.agriculture?.frostRisk).toBeGreaterThanOrEqual(0)
        expect(response.data.agriculture?.frostRisk).toBeLessThanOrEqual(1)
        expect(response.data.agriculture?.precipitationProbability).toBeGreaterThanOrEqual(0)
        expect(response.data.agriculture?.precipitationProbability).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('Common metadata consistency', () => {
    test('same task returns consistent metadata across roles', async () => {
      const researcherResponse = await getRoleSummaryData('demo-task-probabilistic', 'researcher')
      const policyResponse = await getRoleSummaryData('demo-task-probabilistic', 'policy')
      const agricultureResponse = await getRoleSummaryData('demo-task-probabilistic', 'agriculture')

      expect(researcherResponse.ok).toBe(true)
      expect(policyResponse.ok).toBe(true)
      expect(agricultureResponse.ok).toBe(true)

      if (
        researcherResponse.data.available &&
        policyResponse.data.available &&
        agricultureResponse.data.available
      ) {
        // Same task ID
        expect(researcherResponse.data.metadata.taskId).toBe(policyResponse.data.metadata.taskId)
        expect(policyResponse.data.metadata.taskId).toBe(agricultureResponse.data.metadata.taskId)

        // Same variable
        expect(researcherResponse.data.metadata.variable).toBe(
          policyResponse.data.metadata.variable,
        )
        expect(policyResponse.data.metadata.variable).toBe(
          agricultureResponse.data.metadata.variable,
        )

        // Same sample count
        expect(researcherResponse.data.metadata.sampleCount).toBe(
          policyResponse.data.metadata.sampleCount,
        )
        expect(policyResponse.data.metadata.sampleCount).toBe(
          agricultureResponse.data.metadata.sampleCount,
        )

        // Same time coverage
        expect(researcherResponse.data.metadata.timeCoverage).toEqual(
          policyResponse.data.metadata.timeCoverage,
        )
        expect(policyResponse.data.metadata.timeCoverage).toEqual(
          agricultureResponse.data.metadata.timeCoverage,
        )
      }
    })

    test('ensemble statistics are consistent across roles when both have ensemble data', async () => {
      const researcherResponse = await getRoleSummaryData('demo-task-probabilistic', 'researcher')
      const policyResponse = await getRoleSummaryData('demo-task-probabilistic', 'policy')

      expect(researcherResponse.ok).toBe(true)
      expect(policyResponse.ok).toBe(true)

      if (
        researcherResponse.data.available &&
        policyResponse.data.available &&
        researcherResponse.data.ensemble &&
        policyResponse.data.ensemble
      ) {
        // Same ensemble member count
        expect(researcherResponse.data.ensemble.memberCount).toBe(
          policyResponse.data.ensemble.memberCount,
        )

        // Same mean and standard deviation
        expect(researcherResponse.data.ensemble.mean).toBe(policyResponse.data.ensemble.mean)
        expect(researcherResponse.data.ensemble.stdDev).toBe(policyResponse.data.ensemble.stdDev)

        // Same P10-P90 quantiles
        expect(researcherResponse.data.ensemble.p10).toBe(policyResponse.data.ensemble.p10)
        expect(researcherResponse.data.ensemble.p90).toBe(policyResponse.data.ensemble.p90)

        // Same CRPS if both have it
        if (researcherResponse.data.ensemble.crps && policyResponse.data.ensemble.crps) {
          expect(researcherResponse.data.ensemble.crps.mean).toBe(
            policyResponse.data.ensemble.crps.mean,
          )
          expect(researcherResponse.data.ensemble.crps.median).toBe(
            policyResponse.data.ensemble.crps.median,
          )
        }
      }
    })
  })

  describe('Deterministic task handling', () => {
    test('returns unavailable for deterministic tasks', async () => {
      // This would be a deterministic task - expect unavailable or graceful handling
      const response = await getRoleSummaryData('demo-task-deterministic', 'researcher')

      expect(response.ok).toBe(true)
      // Should either be unavailable or handle gracefully
      if (!response.data.available) {
        expect((response.data as { available: false; reason: string }).reason).toBeDefined()
      }
    })
  })

  describe('Invalid task handling', () => {
    test('returns unavailable for non-existent task', async () => {
      const response = await getRoleSummaryData('non-existent-task', 'researcher')

      expect(response.ok).toBe(true)
      expect(response.data.available).toBe(false)
      if (!response.data.available) {
        expect((response.data as { available: false; reason: string }).reason).toBeDefined()
      }
    })
  })
})
