import { describe, it, expect } from 'vitest'
import { demoCatalogFor } from '@/features/downscaling-tasks/service/demo-catalog'
import type { DownscalingTask } from '@/features/downscaling-tasks/service/contracts'

describe('Demo catalog recovery logic', () => {
  describe('demoCatalogFor', () => {
    it('generates 4 fixed catalog tasks for each account', () => {
      const researcherCatalog = demoCatalogFor('researcher')
      const policyCatalog = demoCatalogFor('policy')
      const agricultureCatalog = demoCatalogFor('agriculture')

      expect(researcherCatalog).toHaveLength(4)
      expect(policyCatalog).toHaveLength(4)
      expect(agricultureCatalog).toHaveLength(4)

      // Verify catalog structure
      expect(researcherCatalog[0]?.catalog?.id).toBe('alpine-temperature')
      expect(researcherCatalog[1]?.catalog?.id).toBe('coastal-wind')
      expect(researcherCatalog[2]?.catalog?.id).toBe('plateau-pressure')
      expect(researcherCatalog[3]?.catalog?.id).toBe('lowland-rain')
    })

    it('generates account-specific task IDs', () => {
      const researcherCatalog = demoCatalogFor('researcher')
      const policyCatalog = demoCatalogFor('policy')

      expect(researcherCatalog[0]?.id).toContain('researcher')
      expect(policyCatalog[0]?.id).toContain('policy')
      expect(researcherCatalog[0]?.id).not.toBe(policyCatalog[0]?.id)
    })

    it('preserves fixed seeds and generator versions', () => {
      const catalog = demoCatalogFor('researcher')

      expect(catalog[0]?.dataSeed).toBe(42)
      expect(catalog[0]?.generatorVersion).toBe('synthetic-temperature-v1')
      expect(catalog[0]?.referenceSeed).toBe(1729)
      expect(catalog[0]?.referenceVersion).toBe('synthetic-observations-v1')
    })

    it('includes catalog metadata with Synthetic Demo label', () => {
      const catalog = demoCatalogFor('researcher')

      for (const task of catalog) {
        expect(task.catalog).toBeDefined()
        expect(task.catalog?.label).toBe('Synthetic Demo')
        expect(task.catalog?.version).toBe(1)
        expect(task.catalog?.description).toContain('Fixed synthetic demonstration')
      }
    })

    it('sets all catalog tasks to Completed status', () => {
      const catalog = demoCatalogFor('researcher')

      for (const task of catalog) {
        expect(task.status).toBe('Completed')
        expect(task.failureReason).toBeNull()
      }
    })
  })

  describe('Missing catalog detection', () => {
    it('identifies missing tasks when none exist', () => {
      const catalog = demoCatalogFor('researcher')
      const existing: DownscalingTask[] = []

      const existingIds = new Set(existing.map((t) => t.id))
      const missing = catalog.filter((task) => !existingIds.has(task.id))

      expect(missing).toHaveLength(4)
    })

    it('identifies missing tasks when some exist', () => {
      const catalog = demoCatalogFor('researcher')
      const existing = [catalog[0]!, catalog[2]!] // alpine-temperature and plateau-pressure

      const existingIds = new Set(existing.map((t) => t.id))
      const missing = catalog.filter((task) => !existingIds.has(task.id))

      expect(missing).toHaveLength(2)
      expect(missing[0]?.catalog?.id).toBe('coastal-wind')
      expect(missing[1]?.catalog?.id).toBe('lowland-rain')
    })

    it('identifies no missing tasks when all exist', () => {
      const catalog = demoCatalogFor('researcher')
      const existing = [...catalog]

      const existingIds = new Set(existing.map((t) => t.id))
      const missing = catalog.filter((task) => !existingIds.has(task.id))

      expect(missing).toHaveLength(0)
    })
  })

  describe('Account isolation', () => {
    it('each account has distinct task IDs', () => {
      const researcherCatalog = demoCatalogFor('researcher')
      const policyCatalog = demoCatalogFor('policy')
      const agricultureCatalog = demoCatalogFor('agriculture')

      const allIds = [
        ...researcherCatalog.map((t) => t.id),
        ...policyCatalog.map((t) => t.id),
        ...agricultureCatalog.map((t) => t.id),
      ]

      const uniqueIds = new Set(allIds)
      expect(uniqueIds.size).toBe(12) // 3 accounts × 4 tasks
    })

    it('each account owns only its own tasks', () => {
      const researcherCatalog = demoCatalogFor('researcher')
      const policyCatalog = demoCatalogFor('policy')

      expect(researcherCatalog.every((t) => t?.ownerId === 'researcher')).toBe(true)
      expect(policyCatalog.every((t) => t?.ownerId === 'policy')).toBe(true)
    })
  })
})
