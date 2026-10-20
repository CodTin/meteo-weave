// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TaskComparisonMetricBars } from '@/features/task-comparison/metrics/metric-bars'

test('renders the supplied common-sample metrics with A/B identity and truthful negative R²', () => {
  const html = renderToStaticMarkup(
    createElement(TaskComparisonMetricBars, {
      names: { a: '方法 A', b: '方法 B' },
      unit: '°C',
      metrics: {
        a: { rmse: 2, mae: 1.5, r2: -0.5, n: 12 },
        b: { rmse: 1, mae: 0.75, r2: 0.75, n: 12 },
      },
    }),
  )
  const document = new DOMParser().parseFromString(html, 'text/html')
  expect(document.querySelectorAll('figure')).toHaveLength(3)
  expect(document.querySelector('figure')?.textContent).toContain('RMSE')
  expect(document.querySelector('figure')?.textContent).toContain('A · 方法 A2.000 °C')
  expect(document.querySelector('figure')?.textContent).toContain('B · 方法 B1.000 °C')
  const r2 = document.querySelectorAll('figure')[2]
  expect(r2?.textContent).toContain('R²')
  expect(r2?.textContent).toContain('-0.500')
  expect(r2?.textContent).toContain('0.750')
  expect(r2?.textContent).not.toContain('改善排名')
  expect(document.body.textContent).toContain('n = 12')
})

test('does not turn undefined constant-reference R² into a zero score or ranking', () => {
  const html = renderToStaticMarkup(
    createElement(TaskComparisonMetricBars, {
      names: { a: 'A', b: 'B' },
      unit: 'mm',
      metrics: {
        a: { rmse: 0, mae: 0, r2: null, n: 4, r2UnavailableReason: 'constant-reference' },
        b: { rmse: 1, mae: 1, r2: null, n: 4, r2UnavailableReason: 'constant-reference' },
      },
    }),
  )
  const document = new DOMParser().parseFromString(html, 'text/html')
  const r2 = document.querySelectorAll('figure')[2]
  expect(r2?.textContent).toContain('不可计算')
  expect(r2?.textContent).toContain('无定义；不会以零替代')
  expect(r2?.textContent).not.toContain('0.000')
  expect(r2?.querySelectorAll('[aria-hidden=true]')).toHaveLength(0)
})
