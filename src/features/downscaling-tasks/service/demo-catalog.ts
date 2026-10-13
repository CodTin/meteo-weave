import type { DemoAccount } from '@/features/auth/demo-accounts'
import type { DownscalingTask } from './contracts'
import { validateTaskRecord, sameTaskMetadata } from './record-validation'

// Immutable v1 examples, not aliases for whichever generator/reference happens to be current.
const cases = [
  {
    id: 'alpine-temperature',
    name: 'Alpine mountain temperature',
    terrain: 'mountains',
    variable: 'temperature',
    dataSource: 'ecmwf',
    resolution: '3km',
    method: 'deterministic',
    dataSeed: 42,
    generatorVersion: 'synthetic-temperature-v1',
    region: { west: 10, east: 12, south: 46, north: 48 },
  },
  {
    id: 'coastal-wind',
    name: 'Coastal plain wind ensemble',
    terrain: 'coastal-plain',
    variable: 'wind',
    dataSource: 'gfs',
    resolution: '3km',
    method: 'probabilistic',
    dataSeed: 73,
    generatorVersion: 'synthetic-ensemble-v3',
    region: { west: 120, east: 122, south: 30, north: 32 },
  },
  {
    id: 'plateau-pressure',
    name: 'Plateau MSL pressure',
    terrain: 'plateau',
    variable: 'pressure',
    dataSource: 'fusion',
    resolution: '5km',
    method: 'deterministic',
    dataSeed: 101,
    generatorVersion: 'synthetic-variables-v2',
    region: { west: 90, east: 92, south: 32, north: 34 },
  },
  {
    id: 'lowland-rain',
    name: 'Lowland plain rainfall ensemble',
    terrain: 'lowland-plain',
    variable: 'precipitation',
    dataSource: 'fusion',
    resolution: '1km',
    method: 'probabilistic',
    dataSeed: 211,
    generatorVersion: 'synthetic-ensemble-v3',
    region: { west: 113, east: 115, south: 29, north: 31 },
  },
] as const

/** A fixed catalog for an authenticated owner; accepts no caller-supplied configuration. */
export function demoCatalogFor(ownerId: DemoAccount['id']): DownscalingTask[] {
  return cases.map((example) => ({
    schemaVersion: 1,
    id: `demo-v1:${ownerId}:${example.id}`,
    ownerId,
    name: `Synthetic Demo · ${example.name}`,
    configuration: {
      dataSource: example.dataSource,
      variable: example.variable,
      resolution: example.resolution,
      region: { ...example.region },
      timeRange: { mode: 'historical', start: '2024-01-01', end: '2024-01-03' },
      ...(example.method === 'probabilistic'
        ? {
            method: 'probabilistic',
            resolvedMethod: 'probabilistic',
            advanced: { uncertaintyQuantification: true, ensembleMembers: 5 },
          }
        : { method: 'deterministic', resolvedMethod: 'deterministic' }),
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    submittedAt: '2024-01-01T00:00:00.000Z',
    completionAt: '2024-01-01T00:00:02.500Z',
    status: 'Completed',
    failureReason: null,
    dataSeed: example.dataSeed,
    generatorVersion: example.generatorVersion,
    referenceSeed: 1729,
    referenceVersion: 'synthetic-observations-v1',
    catalog: {
      id: example.id,
      version: 1,
      terrain: example.terrain,
      label: 'Synthetic Demo',
      description:
        'Fixed synthetic demonstration with synthetic stations. ECMWF/GFS/Fusion are configuration labels only; no real observations, model training or inference.',
    },
  }))
}

/** Read-only role exception for the entire immutable canonical snapshot, never an id/flag. */
export function isCanonicalCatalogTask(task: DownscalingTask) {
  const expected = demoCatalogFor(task.ownerId).find((candidate) => candidate.id === task.id)
  if (!expected) return false
  const canonical = validateTaskRecord(expected)
  return (
    canonical.ok && sameTaskMetadata(task, canonical.task) && sameTaskMetadata(canonical.task, task)
  )
}
