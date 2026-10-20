// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TaskComparisonParameters } from '@/features/task-comparison/parameters/parameter-table'
import { exportTask } from '../factories/export-task'
import { getComparisonParameters } from '@/features/task-comparison/parameters'

test('keeps A/B identities and reports requested and resolved methods separately', () => {
  const a = exportTask({ id: 'task-a', name: '配置 A' })
  const b = exportTask({ id: 'task-b', name: '配置 B', ensembleMembers: 5 })
  const result = getComparisonParameters({ a, b })

  expect(result.identities).toEqual([
    { position: 'A', id: 'task-a', name: '配置 A' },
    { position: 'B', id: 'task-b', name: '配置 B' },
  ])
  expect(result.rows.find((row) => row.key === 'requestedMethod')).toMatchObject({
    a: '推荐方法',
    b: '概率式方法',
    different: true,
  })
  expect(result.rows.find((row) => row.key === 'resolvedMethod')).toMatchObject({
    a: '确定性方法',
    b: '概率式方法',
    different: true,
  })
  expect(result.rows.find((row) => row.key === 'ensembleMembers')).toMatchObject({
    a: '不适用（确定性输出）',
    b: '5 个',
    different: true,
  })
})

test('shows every saved configuration dimension and marks changes without relying on color', () => {
  const a = exportTask({ id: 'a' })
  const b = exportTask({
    id: 'b',
    variable: 'pressure',
    resolution: '1km',
    region: { west: 119, east: 120, south: 29, north: 30 },
    timeRange: { mode: 'historical', start: '2024-06-15', end: '2024-06-16' },
    ensembleMembers: 20,
  })
  b.configuration.dataSource = 'gfs'
  b.createdAt = '2024-06-01T08:00:00.000Z'
  const result = getComparisonParameters({ a, b })

  expect(result.rows.map((row) => row.key)).toEqual([
    'dataSource',
    'variable',
    'region',
    'timeMode',
    'timeRange',
    'granularity',
    'requestedMethod',
    'resolvedMethod',
    'resolution',
    'ensembleMembers',
    'advanced',
    'createdAt',
  ])
  expect(result.rows.find((row) => row.key === 'dataSource')).toMatchObject({
    a: 'ECMWF',
    b: 'GFS',
    different: true,
  })
  expect(result.rows.find((row) => row.key === 'variable')).toMatchObject({
    a: '气温 · °C',
    b: '海平面气压 · hPa',
    different: true,
  })
  expect(result.rows.find((row) => row.key === 'region')).toMatchObject({
    a: '120°E – 120.12°E；30°N – 30.08°N',
    b: '119°E – 120°E；29°N – 30°N',
    different: true,
  })
  expect(result.rows.find((row) => row.key === 'granularity')).toMatchObject({
    a: '逐小时瞬时值',
    b: '逐日原生快照（非日统计）',
    different: true,
  })
  expect(result.rows.find((row) => row.key === 'advanced')).toMatchObject({
    a: '未设置',
    b: '不确定性量化：开启；集合成员数：20',
    different: true,
  })
  expect(result.rows.find((row) => row.key === 'createdAt')).toMatchObject({
    a: '2024-01-01T00:00:00.000Z',
    b: '2024-06-01T08:00:00.000Z',
    different: true,
  })
})

test('renders a semantic complete parameter table with written differences and fixed A/B headers', () => {
  const a = exportTask({ id: 'task-a', name: '配置 A' })
  const b = exportTask({ id: 'task-b', name: '配置 B', resolution: '1km' })
  const document = new DOMParser().parseFromString(
    renderToStaticMarkup(createElement(TaskComparisonParameters, { a, b })),
    'text/html',
  )
  expect(document.querySelector('table caption')?.textContent).toContain('参数差异')
  const headers = Array.from(
    document.querySelectorAll('thead th'),
    (element) => element.textContent,
  )
  expect(headers).toEqual(['配置参数', 'A · 配置 Atask-a', 'B · 配置 Btask-b', '差异'])
  const rows = Array.from(document.querySelectorAll('tbody tr'))
  expect(rows).toHaveLength(12)
  const resolution = rows.find((row) => row.querySelector('th')?.textContent === '目标分辨率')
  expect(resolution?.textContent).toBe('目标分辨率3km1km不同')
  const unit = rows.find((row) => row.querySelector('th')?.textContent === '气象变量与单位')
  expect(unit?.textContent).toBe('气象变量与单位气温 · °C气温 · °C相同')
})
