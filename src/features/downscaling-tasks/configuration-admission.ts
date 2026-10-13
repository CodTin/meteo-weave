import { z } from 'zod'
import type { DemoAccount } from '@/features/auth/demo-accounts'
import { getDownscalingCapabilities } from './capabilities'

const configurationInput = z.strictObject({
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
      .strictObject({ mode: z.literal('forecast'), start: z.iso.datetime(), end: z.iso.datetime() })
      .refine((range) => {
        const hour = 60 * 60 * 1000
        const currentHour = Math.floor(Date.now() / hour) * hour
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

export function checkDownscalingConfiguration(account: DemoAccount, input: unknown) {
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
    .object({ role: z.unknown().optional(), ownerId: z.unknown().optional() })
    .passthrough()
    .safeParse(input)
  const { role: _role, ownerId: _ownerId, ...configuration } = raw.success ? raw.data : {}
  const parsed = configurationInput.safeParse(raw.success ? configuration : input)
  if (!parsed.success) {
    return {
      ok: false as const,
      code: 'INVALID_CONFIGURATION' as const,
      error: '降尺度配置无效，请检查输入参数。',
    }
  }
  const { method, advanced } = parsed.data
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
  if (parsed.data.method === 'probabilistic' || parsed.data.advanced?.uncertaintyQuantification) {
    return {
      ok: true as const,
      configuration: {
        ...parsed.data,
        resolvedMethod: 'probabilistic' as const,
        advanced: {
          uncertaintyQuantification: parsed.data.advanced?.uncertaintyQuantification ?? false,
          ensembleMembers: parsed.data.advanced?.ensembleMembers ?? 10,
        },
      },
    }
  }
  return {
    ok: true as const,
    configuration: { ...parsed.data, resolvedMethod: 'deterministic' as const },
  }
}

export type DownscalingConfigurationInput = z.input<typeof configurationInput>
export type AdmittedDownscalingConfiguration = Extract<
  ReturnType<typeof checkDownscalingConfiguration>,
  { ok: true }
>['configuration']
