import { describe, expect, it } from 'vitest'
import { safeReturnTo } from '@/features/auth/return-to'
import { getWorkspaceTitle } from '@/components/workspace/workspace-navigation'

describe('comparison login continuation', () => {
  it('returns to the literal comparison page with the selected A/B identities and context', () => {
    const destination = new URL(
      safeReturnTo('/tasks/compare?a=task-z%2B1&b=task-a%2F2&view=参数+差异#metrics'),
      'https://demo.test',
    )

    expect({
      origin: destination.origin,
      pathname: destination.pathname,
      query: [...destination.searchParams],
      hash: destination.hash,
    }).toEqual({
      origin: 'https://demo.test',
      pathname: '/tasks/compare',
      query: [
        ['a', 'task-z+1'],
        ['b', 'task-a/2'],
        ['view', '参数 差异'],
      ],
      hash: '#metrics',
    })
  })

  it.each([
    ['/tasks/compare', []],
    ['/tasks/compare?a=task-first', [['a', 'task-first']]],
    [
      '/tasks/compare?a=&b=task-second',
      [
        ['a', ''],
        ['b', 'task-second'],
      ],
    ],
    [
      '/tasks/compare?a=task-first&b=task-first',
      [
        ['a', 'task-first'],
        ['b', 'task-first'],
      ],
    ],
    [
      '/tasks/compare?a=%20task-first%20&b=task-second',
      [
        ['a', ' task-first '],
        ['b', 'task-second'],
      ],
    ],
    [
      '/tasks/compare?a=%7B%22id%22%3A%22task-first%22%7D&b=task-second',
      [
        ['a', '{"id":"task-first"}'],
        ['b', 'task-second'],
      ],
    ],
  ])('retains an unvalidated selection for the page to recover: %s', (target, query) => {
    const destination = new URL(safeReturnTo(target), 'https://demo.test')
    expect({ pathname: destination.pathname, query: [...destination.searchParams] }).toEqual({
      pathname: '/tasks/compare',
      query,
    })
  })

  it.each(['/dashboard', '/tasks', '/tasks/new', '/settings'])(
    'keeps the existing literal workspace destination and context: %s',
    (path) => {
      const destination = new URL(
        safeReturnTo(path + '?filter=已完成+任务#results'),
        'https://demo.test',
      )
      expect({
        origin: destination.origin,
        pathname: destination.pathname,
        query: [...destination.searchParams],
        hash: destination.hash,
      }).toEqual({
        origin: 'https://demo.test',
        pathname: path,
        query: [['filter', '已完成 任务']],
        hash: '#results',
      })
    },
  )

  it.each([
    undefined,
    null,
    42,
    { path: '/tasks/compare' },
    ['/tasks/compare'],
    'https://demo.test/tasks/compare?a=task-first&b=task-second',
    'https://evil.example/tasks/compare',
    '//evil.example/tasks/compare',
    '/tasks\\compare',
    '/tasks/compare?a=task-first\\&b=task-second',
    ' /tasks/compare',
    '/tasks/compare ',
    '/tasks/compare?a=task-first\n&b=task-second',
    '/tasks/compare?a=task-first\u0000',
    '/tasks/compare?a=task-first\u007f',
    '/%74asks/compare',
    '/tasks/%63ompare',
    '/tasks/%2563ompare',
    '/tasks/compare%2F',
    '/tasks//compare',
    '/tasks/new/../compare',
    '/tasks/compare/../settings',
    '/tasks/compare/',
    '/tasks/compare/nested',
    '/tasks/compare-extra',
    '/tasks/Compare',
    '/tasks/task-first?a=task-first&b=task-second',
    '/login?returnTo=/tasks/compare',
  ])('rejects unsafe or nonliteral comparison continuations: %j', (target) => {
    expect(safeReturnTo(target)).toBe('/dashboard')
  })
})

describe('comparison workspace title', () => {
  it('resolves the literal static comparison pathname', () => {
    expect(getWorkspaceTitle('/tasks/compare')).toBe('任务对比')
  })

  it('keeps the existing single trailing-slash title normalization for comparison', () => {
    expect(getWorkspaceTitle('/tasks/compare/')).toBe('任务对比')
  })

  it.each([
    ['/dashboard', 'Dashboard'],
    ['/tasks', '任务管理'],
    ['/tasks/', '任务管理'],
    ['/tasks/new', '创建任务'],
    ['/settings', '设置'],
  ])('keeps the existing workspace title for %s', (pathname, title) => {
    expect(getWorkspaceTitle(pathname)).toBe(title)
  })

  it.each([
    '/tasks/task-first',
    '/tasks/compare/nested',
    '/tasks/compare-extra',
    '/tasks/Compare',
    '/tasks/%63ompare',
    '/tasks/compare//',
    '/tasks/compare?a=task-first&b=task-second',
    '/unknown',
  ])('does not label a task id or another path as comparison: %s', (pathname) => {
    expect(getWorkspaceTitle(pathname)).toBeUndefined()
  })
})
