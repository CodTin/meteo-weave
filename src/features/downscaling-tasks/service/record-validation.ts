import { z } from 'zod'
import { TASK_DURATION_MS, TASK_SCHEMA_VERSION, unavailable, type TaskReply } from './contracts'

const region = z
  .strictObject({
    north: z.number().min(-90).max(90),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    west: z.number().min(-180).max(180),
  })
  .refine((value) => value.north > value.south && value.east > value.west)

// Storage validation is deliberately independent of today's forecast admission window.
const baseConfiguration = z.strictObject({
  dataSource: z.enum(['ecmwf', 'gfs', 'fusion']),
  variable: z.enum(['temperature', 'wind', 'pressure', 'precipitation']),
  resolution: z.enum(['1km', '3km', '5km']),
  method: z.enum(['recommended', 'deterministic', 'probabilistic']),
  region,
  timeRange: z.discriminatedUnion('mode', [
    z
      .strictObject({ mode: z.literal('historical'), start: z.iso.date(), end: z.iso.date() })
      .refine(
        (value) =>
          value.start <= value.end && value.start >= '2020-01-01' && value.end <= '2024-12-31',
      ),
    z
      .strictObject({ mode: z.literal('forecast'), start: z.iso.datetime(), end: z.iso.datetime() })
      .refine(
        (value) =>
          Date.parse(value.start) <= Date.parse(value.end) &&
          Date.parse(value.start) % 3_600_000 === 0 &&
          Date.parse(value.end) % 3_600_000 === 0,
      ),
  ]),
})
const configuration = z.discriminatedUnion('resolvedMethod', [
  baseConfiguration
    .extend({
      resolvedMethod: z.literal('deterministic'),
      advanced: z.strictObject({ uncertaintyQuantification: z.literal(false) }).optional(),
    })
    .refine((value) => value.method !== 'probabilistic'),
  baseConfiguration
    .extend({
      resolvedMethod: z.literal('probabilistic'),
      advanced: z.strictObject({
        uncertaintyQuantification: z.boolean(),
        ensembleMembers: z.union([z.literal(5), z.literal(10), z.literal(20)]),
      }),
    })
    .refine(
      (value) =>
        value.method !== 'deterministic' &&
        (value.method === 'probabilistic' || value.advanced.uncertaintyQuantification),
    ),
])
const record = z
  .strictObject({
    schemaVersion: z.literal(TASK_SCHEMA_VERSION),
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(200),
    ownerId: z.enum(['researcher', 'policy', 'agriculture']),
    configuration,
    createdAt: z.iso.datetime(),
    submittedAt: z.iso.datetime(),
    completionAt: z.iso.datetime(),
    status: z.enum(['Running', 'Completed', 'Failed']),
    failureReason: z.string().min(1).max(500).nullable(),
    dataSeed: z.number().int().min(0).max(0xffff_ffff),
    generatorVersion: z.string().min(1).max(100),
  })
  .refine(
    (value) =>
      Date.parse(value.createdAt) <= Date.parse(value.submittedAt) &&
      Date.parse(value.completionAt) - Date.parse(value.submittedAt) === TASK_DURATION_MS &&
      (value.status === 'Failed' ? value.failureReason !== null : value.failureReason === null),
  )
  .refine((value) => {
    const range = value.configuration.timeRange
    if (range.mode !== 'forecast') return true
    const submissionHour = Math.floor(Date.parse(value.submittedAt) / 3_600_000) * 3_600_000
    return (
      Date.parse(range.start) >= submissionHour &&
      Date.parse(range.end) <= submissionHour + 7 * 24 * 3_600_000
    )
  })

export function validateTaskRecord(input: unknown): TaskReply {
  const envelope = z.object({ schemaVersion: z.number() }).safeParse(input)
  if (envelope.success && envelope.data.schemaVersion !== TASK_SCHEMA_VERSION) {
    return unavailable(
      'INCOMPATIBLE_SCHEMA',
      'This saved task schema is not supported; the record was not replaced.',
    )
  }
  const parsed = record.safeParse(input)
  return parsed.success
    ? { ok: true, task: parsed.data }
    : unavailable(
        'INVALID_RECORD',
        'Saved task metadata is invalid; other tasks have not been reset.',
      )
}
