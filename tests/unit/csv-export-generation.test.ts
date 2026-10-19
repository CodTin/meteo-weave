import { describe, expect, it } from 'vitest'
import { requestHandler } from '@tanstack/react-start/server'
import { isRedirect } from '@tanstack/react-router'
import {
  estimateExportMetrics,
  generateCsvExport,
  generateCsvFromTask,
  generateGeoJsonExport,
  validateExportRequest,
} from '@/server/services/csv-export.server'
import { loginDemoAccount } from '@/server/services/demo-session.server'
import { exportRequest, exportTask } from '../factories/export-task'

async function accountCookie(account = 'researcher') {
  const response = await requestHandler(() =>
    Response.json(loginDemoAccount({ account, password: 'meteo-demo' })),
  )(new Request('http://demo.test/login', { method: 'POST' }), {})
  expect(response.status).toBe(200)
  return response.headers.get('set-cookie')!.split(';')[0]!
}

async function exportResponse(
  operation: 'csv' | 'geojson' | 'estimate',
  input: unknown,
  cookie: string,
) {
  return requestHandler(async () => {
    try {
      const result =
        operation === 'estimate'
          ? estimateExportMetrics(input)
          : await (operation === 'csv' ? generateCsvExport(input) : generateGeoJsonExport(input))
      return Response.json(result)
    } catch (error) {
      if (isRedirect(error)) return error
      throw error
    }
  })(new Request('http://demo.test/export', { method: 'POST', headers: { cookie } }), {})
}

describe('actual current-request export boundary', () => {
  it.each(['csv', 'geojson', 'estimate'] as const)(
    'authenticates %s with a full saved task, same exact count and no id-only lookup',
    async (operation) => {
      const cookie = await accountCookie()
      const request = exportRequest()
      const response = await exportResponse(operation, request, cookie)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toMatchObject({ ok: true, recordCount: 54 })
      const missingTask = await exportResponse(
        operation,
        {
          taskId: request.taskId,
          bbox: request.bbox,
          timeRange: request.timeRange,
          dataTypes: request.dataTypes,
        },
        cookie,
      )
      expect(await missingTask.json()).toMatchObject({ ok: false, code: 'INVALID_REQUEST' })
      const foreign = await exportResponse(
        operation,
        exportRequest(exportTask({ ownerId: 'policy' })),
        cookie,
      )
      expect(await foreign.json()).toMatchObject({ ok: false, code: 'NOT_FOUND' })
      const mismatch = await exportResponse(operation, { ...request, taskId: 'other-task' }, cookie)
      expect(await mismatch.json()).toMatchObject({ ok: false, code: 'TASK_ID_MISMATCH' })
      const anonymous = await exportResponse(operation, request, '')
      expect(anonymous.status).toBe(307)
      expect(anonymous.headers.get('location')).toMatch(/^\/login\?/)
    },
  )

  it('preserves role restrictions instead of treating a forbidden task as missing science', async () => {
    const cookie = await accountCookie('policy')
    const task = exportTask({ ownerId: 'policy', ensembleMembers: 5 })
    const response = await exportResponse('csv', exportRequest(task), cookie)
    expect(await response.json()).toMatchObject({ ok: false, code: 'ROLE_RESTRICTED' })
  })

  it.each(['csv', 'geojson', 'estimate'] as const)(
    'rejects invalid %s requests rather than emitting a fake success',
    async (operation) => {
      const cookie = await accountCookie()
      const request = exportRequest()
      const response = await exportResponse(
        operation,
        { ...request, bbox: { ...request.bbox, west: NaN } },
        cookie,
      )
      expect(await response.json()).toMatchObject({ ok: false, code: 'INVALID_REQUEST' })
      const partial = await exportResponse(
        operation,
        { ...request, task: { schemaVersion: 1, id: request.taskId, ownerId: 'researcher' } },
        cookie,
      )
      expect(await partial.json()).toMatchObject({ ok: false, code: 'INVALID_RECORD' })
    },
  )
})

describe('public generation failure and sizing limits', () => {
  it('does not disguise unsupported versions or unavailable task states as blank rows', async () => {
    const unsupported = exportTask({ generatorVersion: 'not-available' })
    expect(await generateCsvFromTask(exportRequest(unsupported), unsupported)).toMatchObject({
      ok: false,
      code: 'INCOMPATIBLE_GENERATOR',
    })
    const failed = exportTask({ status: 'Failed' })
    expect(await generateCsvFromTask(exportRequest(failed), failed)).toMatchObject({
      ok: false,
      code: 'FAILED',
    })
    const running = exportTask({ status: 'Running' })
    expect(await generateCsvFromTask(exportRequest(running), running)).toMatchObject({
      ok: false,
      code: 'RUNNING',
    })
  })

  it('limits individual bbox edges instead of total area', () => {
    const task = exportTask({ region: { west: 0, east: 2, south: 0, north: 2 } })
    expect(
      validateExportRequest(
        exportRequest(task, { bbox: { west: 0, east: 1, south: 0, north: 0.01 } }),
      ),
    ).toMatchObject({ ok: false, code: 'BBOX_TOO_LARGE' })
    expect(
      validateExportRequest(
        exportRequest(task, { bbox: { west: 0, east: 0.01, south: 0, north: 1 } }),
      ),
    ).toMatchObject({ ok: false, code: 'BBOX_TOO_LARGE' })
  })

  it('rejects oversized location/time requests before generation', async () => {
    const task = exportTask({
      resolution: '1km',
      region: { west: 0, east: 0.89, south: 0, north: 0.89 },
    })
    const result = await generateCsvFromTask(
      exportRequest(task, {
        dataTypes: ['downscaled'],
        timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' },
      }),
      task,
    )
    expect(result).toMatchObject({ ok: false, code: 'EXPORT_LIMIT_EXCEEDED' })
    expect('csv' in result).toBe(false)
  })
})
