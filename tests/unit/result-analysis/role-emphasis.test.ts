/**
 * Unit tests for role-based emphasis in accuracy assessment.
 *
 * Verifies that:
 * - Each role has all four assessment groups in its order
 * - Role configurations don't duplicate or omit groups
 * - Emphasis configurations are consistent and valid
 */

import { describe, it, expect } from 'vitest'
import {
  type UserRole,
  ROLE_EMPHASIS,
  getRoleEmphasis,
  isMetricHighlighted,
} from '@/features/result-analysis/types/role-emphasis'

describe('Role Emphasis Configuration', () => {
  const roles: UserRole[] = ['researcher', 'policy', 'agriculture']
  const requiredGroups = ['overall', 'distribution', 'spatial', 'events']

  describe('Role configurations exist', () => {
    it('should have configuration for all three roles', () => {
      expect(ROLE_EMPHASIS).toHaveProperty('researcher')
      expect(ROLE_EMPHASIS).toHaveProperty('policy')
      expect(ROLE_EMPHASIS).toHaveProperty('agriculture')
    })
  })

  describe('Group order completeness', () => {
    roles.forEach((role) => {
      it(`${role} should have exactly 4 groups in groupOrder`, () => {
        const emphasis = ROLE_EMPHASIS[role]
        expect(emphasis.groupOrder).toHaveLength(4)
      })

      it(`${role} should include all required groups`, () => {
        const emphasis = ROLE_EMPHASIS[role]
        const groupSet = new Set(emphasis.groupOrder)

        requiredGroups.forEach((group) => {
          expect(groupSet.has(group as any)).toBe(true)
        })
      })

      it(`${role} should not have duplicate groups`, () => {
        const emphasis = ROLE_EMPHASIS[role]
        const groupSet = new Set(emphasis.groupOrder)
        expect(groupSet.size).toBe(4)
      })
    })
  })

  describe('Role-specific ordering', () => {
    it('researcher should prioritize overall accuracy first', () => {
      const emphasis = ROLE_EMPHASIS.researcher
      expect(emphasis.groupOrder[0]).toBe('overall')
    })

    it('policy should prioritize extreme events first', () => {
      const emphasis = ROLE_EMPHASIS.policy
      expect(emphasis.groupOrder[0]).toBe('events')
    })

    it('agriculture should prioritize extreme events first', () => {
      const emphasis = ROLE_EMPHASIS.agriculture
      expect(emphasis.groupOrder[0]).toBe('events')
    })
  })

  describe('Metric highlighting', () => {
    it('researcher should highlight technical metrics (rmse, mae, r2)', () => {
      const emphasis = ROLE_EMPHASIS.researcher
      expect(emphasis.overallHighlight).toContain('rmse')
      expect(emphasis.overallHighlight).toContain('mae')
      expect(emphasis.overallHighlight).toContain('r2')
    })

    it('policy should highlight r2 for decision-making', () => {
      const emphasis = ROLE_EMPHASIS.policy
      expect(emphasis.overallHighlight).toContain('r2')
    })

    it('agriculture should highlight mae for practical deviation', () => {
      const emphasis = ROLE_EMPHASIS.agriculture
      expect(emphasis.overallHighlight).toContain('mae')
    })
  })

  describe('getRoleEmphasis function', () => {
    roles.forEach((role) => {
      it(`should return valid emphasis for ${role}`, () => {
        const emphasis = getRoleEmphasis(role)
        expect(emphasis).toBeDefined()
        expect(emphasis.groupOrder).toHaveLength(4)
        expect(emphasis.description).toBeTruthy()
      })
    })
  })

  describe('isMetricHighlighted function', () => {
    it('should return true for highlighted metrics', () => {
      expect(isMetricHighlighted('researcher', 'rmse')).toBe(true)
      expect(isMetricHighlighted('policy', 'r2')).toBe(true)
      expect(isMetricHighlighted('agriculture', 'mae')).toBe(true)
    })

    it('should return false for non-highlighted metrics', () => {
      expect(isMetricHighlighted('researcher', 'nonexistent')).toBe(false)
      expect(isMetricHighlighted('policy', 'rmse')).toBe(false)
      expect(isMetricHighlighted('agriculture', 'r2')).toBe(false)
    })
  })

  describe('Description and notes', () => {
    roles.forEach((role) => {
      it(`${role} should have a meaningful description`, () => {
        const emphasis = ROLE_EMPHASIS[role]
        expect(emphasis.description).toBeTruthy()
        expect(emphasis.description.length).toBeGreaterThan(5)
      })

      it(`${role} should have notes array (optional but present)`, () => {
        const emphasis = ROLE_EMPHASIS[role]
        if (emphasis.notes) {
          expect(Array.isArray(emphasis.notes)).toBe(true)
          expect(emphasis.notes.length).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('Same input consistency guarantee', () => {
    it('all roles should have the same complete group set', () => {
      const researcherGroups = new Set(ROLE_EMPHASIS.researcher.groupOrder)
      const policyGroups = new Set(ROLE_EMPHASIS.policy.groupOrder)
      const agricultureGroups = new Set(ROLE_EMPHASIS.agriculture.groupOrder)

      // All should have the same groups, just in different order
      expect(researcherGroups.size).toBe(policyGroups.size)
      expect(researcherGroups.size).toBe(agricultureGroups.size)

      // Verify each group exists in all role configurations
      requiredGroups.forEach((group) => {
        expect(researcherGroups.has(group as any)).toBe(true)
        expect(policyGroups.has(group as any)).toBe(true)
        expect(agricultureGroups.has(group as any)).toBe(true)
      })
    })
  })
})
