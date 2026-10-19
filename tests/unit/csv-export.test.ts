import { describe, expect, it } from 'vitest'
import Papa from 'papaparse'
import {
  encodeCsvField,
  escapeCsvText,
  generateCsvContent,
  generateCsvFromTask,
  validateExportRequest,
} from '@/server/services/csv-export.server'
import { queryTaskResult } from '@/features/downscaling-tasks/service/result-queries'
import { exportRequest, exportTask } from '../factories/export-task'

describe('CSV public from-task export', () => {
  it.each(['original', 'downscaled', 'observation'] as const)(
    'exports only selected native %s locations and metadata',
    async (dataType) => {
      const task = exportTask()
      const request = exportRequest(task, { dataTypes: [dataType] })
      const csv = await generateCsvContent(request, task)
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
      expect(parsed.errors).toEqual([])
      expect(parsed.data).toHaveLength({ original: 12, downscaled: 40, observation: 2 }[dataType])
      for (const row of parsed.data) {
        expect(row.dataType).toBe(dataType)
        expect(row.provenance).toBe('Synthetic Demo')
        expect(row.resolutionKm).toBe(
          { original: '10', downscaled: '3', observation: '' }[dataType],
        )
        if (dataType === 'observation') {
          expect(row.stationId).toBe('synthetic-station-v1:120:30')
          expect(row.sampling).toBe('stations')
          expect(row.referenceVersion).toBe('synthetic-observations-v1')
        }
      }
    },
  )

  it.each(['temperature', 'wind', 'pressure', 'precipitation'] as const)(
    'preserves public %s quantities and units without export rounding',
    async (variable) => {
      const task = exportTask({ variable })
      const result = await generateCsvFromTask(exportRequest(task), task)
      if (!result.ok) throw new Error(result.message)
      const rows = Papa.parse<Record<string, string>>(result.csv, {
        header: true,
        skipEmptyLines: true,
      }).data
      expect(rows).toHaveLength(54)
      for (const row of rows) {
        const reply = queryTaskResult(task, {
          kind: 'points',
          layer: row.dataType,
          ...(row.dataType === 'observation' ? { observationMode: 'stations' } : {}),
          temporalResolution: 'hourly',
          points: [{ longitude: Number(row.longitude), latitude: Number(row.latitude) }],
          times: [row.time],
        })
        if (!reply.ok) throw new Error(reply.error)
        expect(row.value).toBe(String(reply.values[0]!.value))
        expect(row.unit).toBe(reply.unit)
        if (reply.variable === 'wind') {
          const sample = reply.values[0]!
          expect(row.u10).toBe(String(sample.u10))
          expect(row.v10).toBe(String(sample.v10))
          expect(row.speed).toBe(String(sample.speed))
          expect(row.direction).toBe(
            sample.fromDirection === null ? '' : String(sample.fromDirection),
          )
          expect(row.directionConvention).toBe('meteorological-from')
        }
        if (reply.variable === 'precipitation') {
          expect(row.accumulationStart).toBe(reply.values[0]!.accumulation.start)
          expect(row.requestedEnd).toBe(reply.values[0]!.accumulation.requestedEnd)
          expect(row.bounds).toBe('[start,end)')
          expect(row.complete).toBe('true')
        }
      }
    },
  )

  it('combines independent native layer counts instead of a shared crop lattice', async () => {
    const task = exportTask({ resolution: '1km' })
    const result = await generateCsvFromTask(exportRequest(task), task)
    if (!result.ok) throw new Error(result.message)
    const parsed = Papa.parse<Record<string, string>>(result.content, {
      header: true,
      skipEmptyLines: true,
    })
    expect(parsed.errors).toEqual([])
    expect(parsed.data.filter((row) => row.dataType === 'original')).toHaveLength(12)
    expect(parsed.data.filter((row) => row.dataType === 'downscaled')).toHaveLength(260)
    expect(parsed.data.filter((row) => row.dataType === 'observation')).toHaveLength(2)
    expect(result.recordCount).toBe(274)
  })

  it('rejects a partial fake task rather than generating invented rows', async () => {
    const result = await generateCsvFromTask(exportRequest(), { id: 'export-task' } as never)
    expect(result).toMatchObject({ ok: false, code: 'INVALID_RECORD' })
    expect(
      validateExportRequest({ ...exportRequest(), task: { id: 'export-task' } }),
    ).toMatchObject({ ok: false, code: 'INVALID_RECORD' })
  })

  it('encodes untrusted identity text safely while retaining scientific negative numbers', async () => {
    const task = exportTask({ id: '=danger,"quoted"' })
    const result = await generateCsvFromTask(exportRequest(task), task)
    if (!result.ok) throw new Error(result.message)
    const parsed = Papa.parse<Record<string, string>>(result.csv, {
      header: true,
      skipEmptyLines: true,
    })
    expect(parsed.errors).toEqual([])
    expect(parsed.data[0]!.taskId).toBe('\'=danger,"quoted"')
    expect(result.filename).not.toMatch(/[=",/:]/)
    expect(encodeCsvField(-4.123456789)).toBe('-4.123456789')
  })
})

describe('CSV field safety', () => {
  it.each(['=1+1', '+SUM(A1)', '-malicious', '@cmd', '\tcommand', 'safe\u0000unsafe'])(
    'neutralizes spreadsheet text %j',
    (text) => {
      expect(escapeCsvText(text)).toBe(`'${text}`)
    },
  )
  it('quotes commas, double quotes, newlines and control-text correctly', () => {
    expect(encodeCsvField('a,b')).toBe('"a,b"')
    expect(encodeCsvField('say "hi"')).toBe('"say ""hi"""')
    expect(encodeCsvField('line1\nline2')).toBe('"\'line1\nline2"')
    expect(encodeCsvField('plain')).toBe('plain')
  })
  it('keeps numeric zero, full precision and missing null distinct', () => {
    expect(encodeCsvField(0)).toBe('0')
    expect(encodeCsvField(-12.123456789)).toBe('-12.123456789')
    expect(encodeCsvField(null)).toBe('')
  })
})
