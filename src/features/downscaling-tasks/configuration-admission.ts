import { z } from 'zod'
import { fromZonedTime } from 'date-fns-tz'
import type { DemoAccount } from '@/features/auth/demo-accounts'
import { getDownscalingCapabilities } from './capabilities'
import { generateDefaultTaskName } from './task-naming'

const configurationInput = (now: number) =>
  z.strictObject({
    name: z.string().trim().min(1, '任务名称不能为空'),
    dataSource: z.enum(['ecmwf', 'gfs', 'fusion']),
    region: z
      .strictObject({
        north: z.number().min(-90).max(90),
        south: z.number().min(-90).max(90),
        east: z.number().min(-180).max(180),
        west: z.number().min(-180).max(180),
      })
      .refine((region) => region.north > region.south && region.east > region.west),
    timeRange: z.discriminatedUnion('mode', [
      z
        .strictObject({
          mode: z.literal('historical'),
          start: z.union([z.iso.date(), z.iso.datetime()]),
          end: z.union([z.iso.date(), z.iso.datetime()]),
        })
        .refine((range) => {
          // Extract date portion for validation
          const startDate = range.start.split('T')[0]!
          const endDate = range.end.split('T')[0]!
          return startDate <= endDate && startDate >= '2020-01-01' && endDate <= '2024-12-31'
        }),
      z
        .strictObject({
          mode: z.literal('forecast'),
          start: z.iso.datetime(),
          end: z.iso.datetime(),
        })
        .refine((range) => {
          const hour = 60 * 60 * 1000
          const currentHour = Math.floor(now / hour) * hour
          const start = Date.parse(range.start)
          const end = Date.parse(range.end)
          return (
            start % hour === 0 &&
            end % hour === 0 &&
            start <= end &&
            start >= currentHour &&
            end <= currentHour + 7 * 24 * hour
          )
        }),
    ]),
    variable: z.enum(['temperature', 'wind', 'pressure', 'precipitation']),
    resolution: z.enum(['1km', '3km', '5km']),
    advanced: z
      .strictObject({
        uncertaintyQuantification: z.boolean().default(false),
        ensembleMembers: z.union([z.literal(5), z.literal(10), z.literal(20)]).optional(),
      })
      .optional(),
    method: z.enum(['recommended', 'deterministic', 'probabilistic']).default('recommended'),
  })

/**
 * Convert a date string in YYYY-MM-DD format from Asia/Shanghai timezone to UTC timestamp.
 * Returns the start of that day in UTC (inclusive).
 *
 * Uses proper timezone handling via date-fns-tz to account for any historical
 * or future DST changes in Asia/Shanghai timezone.
 */
function shanghaiDateToUTC(dateStr: string): string {
  // Parse the date string and interpret it as midnight in Asia/Shanghai timezone
  const [year, month, day] = dateStr.split('-').map(Number)
  const localDate = new Date(year!, month! - 1, day!, 0, 0, 0, 0)

  // Convert from Asia/Shanghai to UTC using proper timezone library
  const utcDate = fromZonedTime(localDate, 'Asia/Shanghai')
  return utcDate.toISOString()
}

export function checkDownscalingConfiguration(
  account: DemoAccount,
  input: unknown,
  now = Date.now(),
) {
  const capabilities = getDownscalingCapabilities(account)
  const requested = z
    .object({ method: z.string().optional(), advanced: z.unknown().optional() })
    .passthrough()
    .safeParse(input)
  if (
    requested.success &&
    !capabilities.allowsAdvanced &&
    ((requested.data.method !== undefined &&
      !capabilities.methods.some((method) => method === requested.data.method)) ||
      Object.hasOwn(requested.data, 'advanced'))
  ) {
    return {
      ok: false as const,
      code: 'ROLE_RESTRICTED' as const,
      error: '当前角色仅可使用推荐方法，不能覆盖研究专属方法或高级参数。',
    }
  }
  // These transport hints never participate in authorization or survive admission.
  const raw = z
    .object({
      role: z.unknown().optional(),
      ownerId: z.unknown().optional(),
      name: z.string().optional(),
    })
    .passthrough()
    .safeParse(input)

  if (!raw.success) {
    return {
      ok: false as const,
      code: 'INVALID_INPUT' as const,
      error: '输入格式无效。',
    }
  }

  const { role: _role, ownerId: _ownerId, name, ...inputConfiguration } = raw.data

  // Check if this is a Spec 05 request (has name field)
  const isSpec05 = name !== undefined

  // Handle name: trim and check if empty, or generate default (only for Spec 05)
  let finalName = name?.trim() || ''

  // First parse to check configuration validity and potentially generate default name
  const parsed = configurationInput(now).safeParse({
    ...inputConfiguration,
    name: isSpec05 ? finalName || 'temp' : 'legacy',
  })
  if (!parsed.success) {
    return {
      ok: false as const,
      code: 'INVALID_CONFIGURATION' as const,
      error: '降尺度配置无效，请检查输入参数。',
    }
  }

  // Generate default name if not provided or empty (only for Spec 05)
  if (isSpec05 && !finalName) {
    finalName = generateDefaultTaskName({
      variable: parsed.data.variable,
      region: parsed.data.region,
      timeRange: parsed.data.timeRange,
    })
  }

  // Now validate with the final name
  const finalParsed = configurationInput(now).safeParse({
    ...inputConfiguration,
    name: isSpec05 ? finalName : 'legacy',
  })
  if (!finalParsed.success) {
    return {
      ok: false as const,
      code: 'INVALID_CONFIGURATION' as const,
      error: '降尺度配置无效，请检查输入参数。',
    }
  }

  const { method, advanced, timeRange } = finalParsed.data

  // Convert historical dates from Asia/Shanghai to UTC with half-open interval
  // Only for Spec 05 requests with date-only strings (not existing ISO timestamps)
  let convertedTimeRange = timeRange
  if (isSpec05 && timeRange.mode === 'historical' && !timeRange.start.includes('T')) {
    const startUTC = shanghaiDateToUTC(timeRange.start)
    // For a single day or date range, end is the start of the next day (exclusive)
    const endDate = new Date(timeRange.end)
    endDate.setDate(endDate.getDate() + 1)
    const endUTC = shanghaiDateToUTC(endDate.toISOString().split('T')[0]!)
    convertedTimeRange = {
      mode: 'historical' as const,
      start: startUTC,
      end: endUTC,
    }
  }

  if (
    (method === 'deterministic' && advanced?.uncertaintyQuantification) ||
    (method !== 'probabilistic' &&
      !advanced?.uncertaintyQuantification &&
      advanced?.ensembleMembers !== undefined)
  ) {
    return {
      ok: false as const,
      code: 'INCOMPATIBLE_METHOD' as const,
      error:
        '确定性输出不能使用不确定性量化或概率集合设置。请选择概率式方法或推荐方法并开启不确定性量化。',
    }
  }

  // Don't include name in configuration for backward compatibility
  // Name is stored at task level, not in configuration
  const { name: _name, ...configWithoutName } = finalParsed.data
  const baseConfig = {
    ...configWithoutName,
    timeRange: convertedTimeRange,
  }

  // Determine resolved method and advanced parameters
  const resolvedMethod =
    finalParsed.data.method === 'probabilistic' ||
    finalParsed.data.advanced?.uncertaintyQuantification
      ? ('probabilistic' as const)
      : ('deterministic' as const)

  const configuration =
    resolvedMethod === 'probabilistic'
      ? {
          ...baseConfig,
          resolvedMethod,
          advanced: {
            uncertaintyQuantification:
              finalParsed.data.advanced?.uncertaintyQuantification ?? false,
            ensembleMembers: finalParsed.data.advanced?.ensembleMembers ?? 10,
          },
        }
      : {
          ...baseConfig,
          resolvedMethod,
        }

  // Return with or without name based on Spec 05 detection
  return isSpec05
    ? {
        ok: true as const,
        name: finalName,
        configuration,
      }
    : {
        ok: true as const,
        configuration,
      }
}

export type DownscalingConfigurationInput = z.input<ReturnType<typeof configurationInput>>
export type AdmittedDownscalingConfiguration = Extract<
  ReturnType<typeof checkDownscalingConfiguration>,
  { ok: true }
>['configuration']
