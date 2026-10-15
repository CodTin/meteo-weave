import { z } from 'zod'
import type { DemoAccount } from '@/features/auth/demo-accounts'
import { getDownscalingCapabilities } from './capabilities'

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
        .strictObject({ mode: z.literal('historical'), start: z.iso.date(), end: z.iso.date() })
        .refine(
          (range) =>
            range.start <= range.end && range.start >= '2020-01-01' && range.end <= '2024-12-31',
        ),
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
 */
function shanghaiDateToUTC(dateStr: string): string {
  // Asia/Shanghai is UTC+8
  // For a date like "2024-06-15", we want 2024-06-15 00:00:00 in Shanghai time
  // which is 2024-06-14 16:00:00 UTC
  const [year, month, day] = dateStr.split('-').map(Number)
  const shanghaiMidnight = Date.UTC(year!, month! - 1, day!, 0, 0, 0, 0) - 8 * 60 * 60 * 1000
  return new Date(shanghaiMidnight).toISOString()
}

/**
 * Generate a default task name from configuration.
 */
function generateDefaultName(config: {
  variable: string
  region: { west: number; east: number; south: number; north: number }
  timeRange: { mode: string; start: string; end: string }
}): string {
  const variableNames = {
    temperature: '气温',
    wind: '风场',
    pressure: '气压',
    precipitation: '降水',
  }
  const varName = variableNames[config.variable as keyof typeof variableNames] || config.variable

  if (config.timeRange.mode === 'historical' && config.timeRange.start === config.timeRange.end) {
    // Single day
    return `${varName} · ${config.timeRange.start}`
  }

  return `${varName} · ${config.region.west}-${config.region.east}E, ${config.region.south}-${config.region.north}N`
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

  const { role: _role, ownerId: _ownerId, name, ...configuration } = raw.data

  // Check if this is a Spec 05 request (has name field)
  const isSpec05 = name !== undefined

  // Handle name: trim and check if empty, or generate default (only for Spec 05)
  let finalName = name?.trim() || ''

  // First parse to check configuration validity and potentially generate default name
  const parsed = configurationInput(now).safeParse({
    ...configuration,
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
    finalName = generateDefaultName({
      variable: parsed.data.variable,
      region: parsed.data.region,
      timeRange: parsed.data.timeRange,
    })
  }

  // Now validate with the final name
  const finalParsed = configurationInput(now).safeParse({
    ...configuration,
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

  if (
    finalParsed.data.method === 'probabilistic' ||
    finalParsed.data.advanced?.uncertaintyQuantification
  ) {
    // Only return name for Spec 05 requests
    return isSpec05
      ? {
          ok: true as const,
          name: finalName,
          configuration: {
            ...baseConfig,
            resolvedMethod: 'probabilistic' as const,
            advanced: {
              uncertaintyQuantification:
                finalParsed.data.advanced?.uncertaintyQuantification ?? false,
              ensembleMembers: finalParsed.data.advanced?.ensembleMembers ?? 10,
            },
          },
        }
      : {
          ok: true as const,
          configuration: {
            ...baseConfig,
            resolvedMethod: 'probabilistic' as const,
            advanced: {
              uncertaintyQuantification:
                finalParsed.data.advanced?.uncertaintyQuantification ?? false,
              ensembleMembers: finalParsed.data.advanced?.ensembleMembers ?? 10,
            },
          },
        }
  }
  return isSpec05
    ? {
        ok: true as const,
        name: finalName,
        configuration: { ...baseConfig, resolvedMethod: 'deterministic' as const },
      }
    : {
        ok: true as const,
        configuration: { ...baseConfig, resolvedMethod: 'deterministic' as const },
      }
}

export type DownscalingConfigurationInput = z.input<ReturnType<typeof configurationInput>>
export type AdmittedDownscalingConfiguration = Extract<
  ReturnType<typeof checkDownscalingConfiguration>,
  { ok: true }
>['configuration']
