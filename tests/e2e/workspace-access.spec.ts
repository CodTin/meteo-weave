import { expect } from './browser-guard'
import { test } from './browser-guard'
import { signInDemo, submitDemoLogin } from './demo-login'

test('anonymous direct task entry redirects before emitting any protected SSR content', async ({
  page,
  request,
}) => {
  const document = await request.get('/tasks', { maxRedirects: 0 })
  expect(document.status()).toBe(307)
  expect(document.headers()['location']).toContain('/login')
  expect(document.headers()['cache-control']).toContain('no-store')
  expect(await document.text()).not.toContain('降尺度任务字段预览')

  const response = await page.goto('/tasks')
  expect(response?.status()).toBe(200)
  expect(await response?.text()).toContain('登录 MeteoWeave')
  expect(await response?.text()).toContain('访问工作区需要先登录')
  expect(await response?.text()).not.toContain('降尺度任务字段预览')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByRole('heading', { level: 1, name: '登录 MeteoWeave' })).toBeVisible()
  await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('real login returns to the requested task page with its query and fragment across SSR and refresh', async ({
  page,
}) => {
  await page.goto('/tasks?status=completed&sort=recent#results')
  await expect(page).toHaveURL(/\/login\?/)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '登录 MeteoWeave' })).toBeVisible()
  await submitDemoLogin(page, 'policy')
  await expect(page).toHaveURL('/tasks?status=completed&sort=recent#results')
  await expect(page.getByRole('table', { name: '降尺度任务字段预览' })).toBeVisible()
  await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
  const refreshed = await page.reload()
  expect(refreshed?.status()).toBe(200)
  expect(refreshed?.headers()['cache-control']).toContain('no-store')
  expect(await refreshed?.text()).toContain('决策演示账号')
  await expect(page).toHaveURL('/tasks?status=completed&sort=recent#results')
})

for (const [path, protectedText] of [
  ['/dashboard', '当前演示账号'],
  ['/tasks', '降尺度任务字段预览'],
  ['/tasks/new', '提交降尺度任务'],
  ['/settings', '保存设置'],
] as const) {
  test(`requires login on direct entry and refresh of ${path}, including unknown sessions`, async ({
    page,
    request,
  }) => {
    const invalid = await request.get(path, {
      headers: { cookie: 'meteo-demo-account=unknown' },
      maxRedirects: 0,
    })
    expect(invalid.status()).toBe(307)
    expect(
      new URL(invalid.headers()['location']!, 'http://demo.test').searchParams.get('returnTo'),
    ).toBe(path)
    expect(await invalid.text()).not.toContain(protectedText)
    for (const visit of [() => page.goto(path), () => page.reload()]) {
      const response = await visit()
      expect(response?.status()).toBe(200)
      expect(await response?.text()).toContain('登录 MeteoWeave')
      expect(await response?.text()).not.toContain(protectedText)
    }
    await expect(page).toHaveURL(
      (url) => url.pathname === '/login' && url.searchParams.get('returnTo') === path,
    )
    await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toHaveCount(0)
  })
}

for (const [target, expected] of [
  ['/tasks?status=completed&sort=recent#results', '/tasks?status=completed&sort=recent#results'],
  ['/tasks/new?source=GFS', '/tasks/new?source=GFS'],
  [
    '/settings?note=%E6%BC%94%E7%A4%BA%20%2F%2Fexample.com#account',
    '/settings?note=%E6%BC%94%E7%A4%BA+%2F%2Fexample.com#account',
  ],
] as const) {
  test(`accepts the serialized workspace return-to ${target}`, async ({ page, baseURL }) => {
    await page.goto(`/login?${new URLSearchParams({ returnTo: target })}`)
    await submitDemoLogin(page)
    if (target.startsWith('/settings?note=')) {
      // Query values, same-origin destination and fragment are the contract,
      // not whether the document or SPA serializer represents a space as %20 or +.
      await expect(page).toHaveURL(
        (url) =>
          url.origin === baseURL &&
          url.pathname === '/settings' &&
          url.searchParams.size === 1 &&
          url.searchParams.get('note') === '演示 //example.com' &&
          url.hash === '#account',
      )
    } else {
      await expect(page).toHaveURL(expected)
    }
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
  })
}

for (const target of [
  'https://evil.example',
  '//evil.example',
  '/\\evil.example',
  '\\evil.example',
  'javascript:alert(1)',
  '/tasks?status=com\tpleted',
  '/tasks#re\nsults',
  '\n/tasks',
  '/ta\t sks',
  '/tasks\0?status=completed',
  '%2F%2Fevil.example',
  '/%5Cevil.example',
  '/%0A/evil.example',
  '%252F%252Fevil.example',
  '/%255Cevil.example',
  '/tasks/../login',
  '/login?returnTo=/login',
  '/missing',
  ' /tasks',
  '/tasks ',
  '',
  '{"path":"/tasks"}',
  '["/tasks"]',
]) {
  test(`rejects unsafe or non-workspace return-to ${JSON.stringify(target)}`, async ({
    page,
    baseURL,
  }) => {
    const navigations: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url())
    })
    await page.goto(`/login?${new URLSearchParams({ returnTo: target })}`)
    await submitDemoLogin(page)
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('researcher')
    expect(navigations.every((url) => new URL(url).origin === new URL(baseURL!).origin)).toBe(true)
  })
}

for (const expired of [false, true]) {
  test(`${expired ? 'expired authenticated' : 'anonymous'} intent preload cannot bypass login on client navigation`, async ({
    page,
    context,
  }) => {
    if (expired) await signInDemo(context)
    await page.goto('/')
    await expect(page.getByRole('main')).toContainText('工作区需要登录')
    const entry = page.getByRole('link', { name: '预览工作区', exact: true })
    const checkedSession = page.waitForResponse(
      (response) =>
        response.request().resourceType() === 'fetch' && response.request().method() === 'GET',
    )
    await entry.hover()
    await checkedSession
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
    if (expired) await context.clearCookies()
    await entry.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(
      (url) => url.pathname === '/login' && url.searchParams.get('returnTo') === '/dashboard',
    )
    await expect(page.getByRole('navigation', { name: '工作区导航', exact: true })).toHaveCount(0)
    await submitDemoLogin(page, 'agriculture')
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('agriculture')
  })
}

for (const path of ['/not-a-page', '/tasks/not-a-page', '/settings/not-a-page']) {
  test(`unknown address ${path} remains a real public 404 rather than a login redirect`, async ({
    page,
    expectedDocument404s,
    baseURL,
  }) => {
    expectedDocument404s.add(new URL(path, baseURL).href)
    const response = await page.goto(path)
    expect(response?.status()).toBe(404)
    expect(await response?.text()).toContain('找不到这个页面')
    await expect(page).toHaveURL(path)
    await expect(page.getByRole('heading', { level: 1, name: '找不到这个页面' })).toBeVisible()
    await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
    await page.getByRole('link', { name: '返回平台入口', exact: true }).click()
    await expect(page).toHaveURL('/')
    await page.getByRole('link', { name: '前往登录', exact: true }).click()
    await expect(page.getByRole('button', { name: '登录演示账号', exact: true })).toBeEnabled()
  })
}

for (const transition of ['refresh', 'workspace navigation'] as const) {
  test(`an expired session is rechecked on ${transition} from an active workspace`, async ({
    page,
    context,
  }) => {
    await signInDemo(context, 'policy')
    await page.goto('/settings')
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
    await context.clearCookies()
    const destination = transition === 'refresh' ? '/settings' : '/tasks'
    if (transition === 'refresh') {
      const response = await page.reload()
      expect(response?.status()).toBe(200)
      expect(await response?.text()).toContain('登录 MeteoWeave')
      expect(await response?.text()).not.toContain('当前演示账号')
    } else {
      await page
        .getByRole('navigation', { name: '工作区导航', exact: true })
        .getByRole('link', { name: '任务管理', exact: true })
        .click()
    }
    await expect(page).toHaveURL(
      (url) => url.pathname === '/login' && url.searchParams.get('returnTo') === destination,
    )
    await expect(page.getByRole('region', { name: '当前演示账号' })).toHaveCount(0)
    await expect(page.getByRole('table')).toHaveCount(0)
    await submitDemoLogin(page, 'policy')
    await expect(page).toHaveURL(destination)
    await expect(page.getByRole('region', { name: '当前演示账号' })).toContainText('policy')
  })
}
