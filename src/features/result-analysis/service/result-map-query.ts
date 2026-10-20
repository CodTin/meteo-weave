import {
  RESULT_QUERY_LIMITS,
  type ResultQuery,
  type ResultReply,
} from '@/features/downscaling-tasks/service'
import type {
  ResultPoint,
  Unavailable,
  WindowSampling,
} from '@/features/downscaling-tasks/service/contracts'
import type { ResultMapSample } from '../types/result-map'
import type { ResultMapSource } from './result-map-data'

export const missingMapCodes = new Set([
  'MISSING_DATA',
  'MISSING_COMPONENT',
  'MISSING_ENSEMBLE',
  'MISSING_MEMBER',
  'NO_OBSERVATION',
])
export type AvailableMapReply = Extract<ResultReply, { ok: true }>

export class MapQueryUnavailable extends Error {
  constructor(readonly reply: Unavailable) {
    super(reply.error)
  }
}

export function mapReplySamples(reply: AvailableMapReply): ResultMapSample[] {
  const missing =
    reply.ensemble?.kind === 'members'
      ? reply.ensemble.unavailable.map(({ code, error, ...point }) => ({
          ...point,
          value: null,
          unavailable: { ok: false as const, code, error },
        }))
      : []
  return [...reply.values, ...missing]
}

/** Coordinates come only from the public reply's native grid and declared preview stride. */
export function previewCoordinates(grid: WindowSampling): ResultPoint[] {
  const { logicalGrid: native, window, stride, sampled } = grid
  const points = []
  for (let row = 0; row < sampled.rows; row++) {
    for (let column = 0; column < sampled.columns; column++) {
      points.push({
        longitude: Math.min(
          native.extent.east,
          native.origin.longitude +
            Math.min(window.lastColumn, window.firstColumn + column * stride.columns) *
              native.spacingDegrees.longitude,
        ),
        latitude: Math.min(
          native.extent.north,
          native.origin.latitude +
            Math.min(window.lastRow, window.firstRow + row * stride.rows) *
              native.spacingDegrees.latitude,
        ),
      })
    }
  }
  return points
}

/** Public point queries fail a whole batch on a missing slot. Bisect only those failures. */
export async function readMapPoints(
  source: ResultMapSource,
  taskId: string,
  query: ResultQuery & { kind: 'points' },
): Promise<{ samples: ResultMapSample[]; replies: AvailableMapReply[] }> {
  const reply = await source.result(taskId, query)
  if (reply.ok) return { samples: mapReplySamples(reply), replies: [reply] }
  if (!missingMapCodes.has(reply.code)) throw new MapQueryUnavailable(reply)
  if (query.points.length === 1)
    return {
      samples: [
        {
          ...query.points[0]!,
          time: new Date(query.times[0]!).toISOString(),
          value: null,
          unavailable: reply,
        },
      ],
      replies: [],
    }
  const middle = Math.ceil(query.points.length / 2)
  const left = await readMapPoints(source, taskId, {
    ...query,
    points: query.points.slice(0, middle),
  })
  const right = await readMapPoints(source, taskId, {
    ...query,
    points: query.points.slice(middle),
  })
  return {
    samples: [...left.samples, ...right.samples],
    replies: [...left.replies, ...right.replies],
  }
}

export async function recoverMapPreview(
  source: ResultMapSource,
  taskId: string,
  query: ResultQuery & { kind: 'preview' },
  geometryTime: string,
): Promise<{ metadata: AvailableMapReply; samples: ResultMapSample[] } | undefined> {
  // Reuse geometry only, never display values from another frame as the requested frame.
  const geometry = await source.result(taskId, { ...query, times: [geometryTime] })
  if (!geometry.ok || geometry.grid.sampling === 'requested-points') return undefined
  const points = previewCoordinates(geometry.grid)
  const members = geometry.ensemble?.memberIds.length ?? 1
  const factor = geometry.ensemble ? members + (geometry.ensemble.kind === 'members' ? 0 : 1) : 1
  const budget = Math.min(
    RESULT_QUERY_LIMITS.points,
    Math.floor(RESULT_QUERY_LIMITS.values / factor),
  )
  const samples: ResultMapSample[] = []
  const replies: AvailableMapReply[] = []
  for (let offset = 0; offset < points.length; offset += budget) {
    const result = await readMapPoints(source, taskId, {
      kind: 'points',
      layer: query.layer,
      observationMode: query.observationMode,
      ensemble: query.ensemble,
      temporalResolution: query.temporalResolution,
      points: points.slice(offset, offset + budget),
      times: query.times,
    } as ResultQuery & { kind: 'points' })
    const known = new Map(
      geometry.values.map((point) => [`${point.longitude},${point.latitude}`, point.observation]),
    )
    samples.push(
      ...result.samples.map((sample) => ({
        ...sample,
        observation: sample.observation ?? known.get(`${sample.longitude},${sample.latitude}`),
      })),
    )
    replies.push(...result.replies)
  }
  const ensemble = geometry.ensemble
  return {
    metadata: {
      ...geometry,
      ...(ensemble
        ? {
            ensemble: {
              ...ensemble,
              samples: replies.flatMap((reply) => reply.ensemble?.samples ?? []),
              unavailable: replies.flatMap((reply) => reply.ensemble?.unavailable ?? []),
            },
          }
        : {}),
    },
    samples,
  }
}
