import { describe, expect, it } from 'vitest'
import { requestHandler } from '@tanstack/react-start/server'
import { isRedirect } from '@tanstack/react-router'
import { loginDemoAccount } from '@/server/services/demo-session.server'
import { generateResultExport, estimateResultExport } from '@/server/services/netcdf-export.server'
import { exportRequest, exportTask } from '../factories/export-task'
import { readNetCDF } from '../lib/netcdf-reader'

async function cookie(account = 'researcher') {
  const response = await requestHandler(() =>
    Response.json(loginDemoAccount({ account, password: 'meteo-demo' })),
  )(new Request('http://demo.test/login', { method: 'POST' }), {})
  return response.headers.get('set-cookie')!.split(';')[0]!
}

async function request(operation: 'estimate' | 'generate', data: unknown, accountCookie: string) {
  let value: unknown
  const response = await requestHandler(async () => {
    try {
      value =
        operation === 'estimate' ? estimateResultExport(data) : await generateResultExport(data)
      return Response.json({ done: true })
    } catch (error) {
      if (isRedirect(error)) return error
      throw error
    }
  })(
    new Request('http://demo.test/export', { method: 'POST', headers: { cookie: accountCookie } }),
    {},
  )
  return { value, response }
}

describe('controlled data-export entry points', () => {
  it('estimates and generates mixed NetCDF through the same real current-account request', async () => {
    const selection = exportRequest(exportTask(), { format: 'netcdf' })
    const accountCookie = await cookie()
    const estimate = await request('estimate', selection, accountCookie)
    expect(estimate.response.status).toBe(200)
    expect(estimate.value).toMatchObject({ ok: true, recordCount: 54 })
    const generated = await request('generate', selection, accountCookie)
    expect(generated.response.headers.get('Cache-Control')).toBe('no-store')
    expect(generated.value).toMatchObject({
      ok: true,
      mimeType: 'application/x-netcdf',
      recordCount: 54,
    })
    const result = generated.value as { content: Uint8Array; byteLength: number }
    expect(result.content).toBeInstanceOf(Uint8Array)
    expect(result.byteLength).toBe(result.content.byteLength)
    const file = readNetCDF(result.content)
    expect(file.dimensions).toContainEqual({ name: 'station', size: 1 })
  })

  it('refuses foreign and id-only task records and requires the actual Demo session', async () => {
    const foreign = exportRequest(exportTask({ ownerId: 'policy' }), { format: 'netcdf' })
    const accountCookie = await cookie()
    expect((await request('generate', foreign, accountCookie)).value).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    const selection = exportRequest(exportTask(), { format: 'netcdf' })
    expect(
      (await request('estimate', { ...selection, task: { id: selection.taskId } }, accountCookie))
        .value,
    ).toMatchObject({ ok: false })
    const anonymous = await request('generate', selection, '')
    expect(anonymous.response.status).toBe(307)
    expect(anonymous.value).toBeUndefined()
  })
})
