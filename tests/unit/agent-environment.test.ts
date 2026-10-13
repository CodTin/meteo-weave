import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { execFileSync, spawnSync } from 'node:child_process'

const agent = resolve('scripts/agent.mjs')
const checker = resolve('scripts/check-agent-contracts.ts')
const bun = resolve('node_modules/.bin/bun')
// Git hooks export repository-local variables; children targeting fixture repos must
// not inherit those (including GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE).
const fixtureEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
)
const callerConfig = join(
  execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim(),
  'config',
)
const callerConfigBefore = readFileSync(callerConfig, 'utf8')
afterAll(() => expect(readFileSync(callerConfig, 'utf8')).toBe(callerConfigBefore))
const temporary: string[] = []
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'meteo-agent-'))
  temporary.push(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', env: fixtureEnv }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Agent fixture')
  writeFileSync(join(root, 'file.txt'), 'original\n')
  git('add', 'file.txt')
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture')
  return { root, git }
}
function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [agent, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: fixtureEnv,
  })
}
afterEach(() =>
  temporary.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
)

describe('agent checkpoint public CLI', () => {
  test('recovers the exact unfinished work and refuses changed content even at the same HEAD', () => {
    const { root, git } = repository()
    writeFileSync(join(root, 'file.txt'), 'unfinished\n')
    const checkpoint = run(
      root,
      'checkpoint',
      '--id',
      'ticket-18',
      '--next',
      'finish browser checks',
    )
    expect(checkpoint.status, checkpoint.stderr).toBe(0)
    const report = JSON.parse(checkpoint.stdout)
    expect(readFileSync(report.path, 'utf8')).toContain('finish browser checks')
    expect(run(root, 'resume', '--id', 'ticket-18').status).toBe(0)
    const head = git('rev-parse', 'HEAD')
    writeFileSync(join(root, 'file.txt'), 'different unfinished work\n')
    const resumed = run(root, 'resume', '--id', 'ticket-18')
    expect(resumed.status).toBe(1)
    expect(resumed.stdout).toContain('changed')
    expect(git('rev-parse', 'HEAD')).toBe(head)
    expect(readFileSync(join(root, 'file.txt'), 'utf8')).toBe('different unfinished work\n')
  })
  test('tracks untracked content and rejects checkpoint IDs that escape the state directory', () => {
    const { root } = repository()
    writeFileSync(join(root, 'new.txt'), 'first')
    expect(run(root, 'checkpoint', '--id', 'new-file', '--next', 'test').status).toBe(0)
    writeFileSync(join(root, 'new.txt'), 'second')
    expect(run(root, 'resume', '--id', 'new-file').status).toBe(1)
    expect(run(root, 'checkpoint', '--id', '../escape', '--next', 'test').status).toBe(1)
  })
})

test('delivery cannot treat an unpublished local commit or dirty checkout as remotely delivered', () => {
  const { root } = repository()
  const unpublished = run(root, 'delivery')
  expect(unpublished.status).toBe(1)
  expect(unpublished.stderr).toMatch(/origin|remote|publish/i)
  writeFileSync(join(root, 'file.txt'), 'unfinished')
  const dirty = run(root, 'delivery')
  expect(dirty.status).toBe(1)
  expect(dirty.stderr).toContain('clean')
})

test('the mechanical guard rejects bare Playwright aliases and flat routes, but allows fixture imports', () => {
  const { root } = repository()
  mkdirSync(join(root, 'tests/e2e'), { recursive: true })
  mkdirSync(join(root, 'src/routes'), { recursive: true })
  writeFileSync(
    join(root, 'tests/e2e/example.spec.ts'),
    'import { test as unsafe } from "@playwright/test"; unsafe("test",()=>{});',
  )
  writeFileSync(join(root, 'src/routes/_workspace.tasks.tsx'), 'export const route = 1')
  const check = () =>
    spawnSync(bun, [checker, '--root', root], { encoding: 'utf8', env: fixtureEnv })
  const red = check()
  expect(red.status).toBe(1)
  expect(red.stderr).toContain('browser-guard')
  expect(red.stderr).toContain('directory')
  writeFileSync(
    join(root, 'tests/e2e/example.spec.ts'),
    'import { test } from "./browser-guard"; test("test",()=>{});',
  )
  rmSync(join(root, 'src/routes/_workspace.tasks.tsx'))
  mkdirSync(join(root, 'src/routes/_workspace/tasks'), { recursive: true })
  writeFileSync(join(root, 'src/routes/_workspace/tasks/index.lazy.tsx'), 'export const route = 1')
  const green = check()
  expect(green.status, green.stderr).toBe(0)
})

test('delivery accepts only successful CI for the exact published HEAD', () => {
  const { root, git } = repository()
  const remote = mkdtempSync(join(tmpdir(), 'meteo-agent-origin-'))
  temporary.push(remote)
  execFileSync('git', ['init', '--bare', '-q', remote], { env: fixtureEnv })
  git('remote', 'add', 'origin', remote)
  git('push', '-q', 'origin', 'main')
  const transport = mkdtempSync(join(tmpdir(), 'meteo-agent-gh-'))
  temporary.push(transport)
  const responsePath = join(transport, 'response.json')
  writeFileSync(
    join(transport, 'gh'),
    `#!/usr/bin/env node\nconsole.log(require('node:fs').readFileSync(${JSON.stringify(responsePath)}, 'utf8'))\n`,
    { mode: 0o755 },
  )
  const delivery = () =>
    spawnSync(process.execPath, [agent, 'delivery'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...fixtureEnv, PATH: `${transport}:${process.env.PATH}` },
    })
  const runRecord = {
    head_sha: git('rev-parse', 'HEAD'),
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/verify.yml',
    html_url: 'https://example.invalid/ci/123',
  }
  writeFileSync(
    responsePath,
    JSON.stringify({ workflow_runs: [{ ...runRecord, head_sha: 'stale' }] }),
  )
  expect(delivery().status).toBe(1)
  writeFileSync(
    responsePath,
    JSON.stringify({ workflow_runs: [{ ...runRecord, conclusion: 'failure' }] }),
  )
  expect(delivery().status).toBe(1)
  writeFileSync(responsePath, JSON.stringify({ workflow_runs: [runRecord] }))
  const accepted = delivery()
  expect(accepted.status, accepted.stderr).toBe(0)
  expect(JSON.parse(accepted.stdout)).toMatchObject({
    status: 'deliverable',
    head: runRecord.head_sha,
  })
})

test('resuming detects ignored runtime configuration changes without disclosing its values', () => {
  const { root, git } = repository()
  writeFileSync(join(root, '.gitignore'), '.env.local\n')
  git('add', '.gitignore')
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'ignore local configuration')
  writeFileSync(join(root, '.env.local'), 'PRIVATE_TEST_CANARY=before\n')
  expect(run(root, 'checkpoint', '--id', 'config', '--next', 'verify').status).toBe(0)
  writeFileSync(join(root, '.env.local'), 'PRIVATE_TEST_CANARY=after\n')
  const resumed = run(root, 'resume', '--id', 'config')
  expect(resumed.status).toBe(1)
  expect(resumed.stdout).not.toContain('PRIVATE_TEST_CANARY')
})

test('verification invalidates a nominally green run when the checkout changes during checks', () => {
  const { root, git } = repository()
  writeFileSync(join(root, '.gitignore'), 'node_modules/\nreports/\n')
  git('add', '.gitignore')
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'ignore runtime outputs')
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true })
  // Replace only the external command boundary, not the snapshot/evidence implementation.
  writeFileSync(
    join(root, 'node_modules/.bin/bun'),
    `#!/usr/bin/env node
if (process.argv.includes('--version')) console.log('1.4.3')
else require('node:fs').writeFileSync('file.txt', 'changed during verification')
`,
    { mode: 0o755 },
  )
  const verified = run(root, 'verify')
  expect(verified.status, verified.stderr).toBe(1)
  const result = JSON.parse(readFileSync(JSON.parse(verified.stdout).result, 'utf8'))
  expect(result).toMatchObject({
    passed: false,
    exitCode: 0,
    unchanged: false,
    command: 'check:all',
  })
  expect(result.logSha256).toMatch(/^[0-9a-f]{64}$/)
})

function protect(root: string, ...extra: string[]) {
  return run(root, 'protect', '--id', 'ownership', '--allow', 'src/', ...extra)
}

test('ownership guard permits owned changes but detects new out-of-scope files and preserves user work', () => {
  const { root, git } = repository()
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src/feature.ts'), 'export const enabled = false\n')
  git('add', 'src')
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'feature baseline')
  writeFileSync(join(root, 'file.txt'), 'user draft\n')
  expect(protect(root).status).toBe(0)
  writeFileSync(join(root, 'src/feature.ts'), 'export const enabled = true\n')
  writeFileSync(join(root, 'src/new.ts'), 'export const another = true\n')
  const verify = () => run(root, 'check-protection', '--id', 'ownership')
  expect(verify().status).toBe(0)
  git('add', 'src')
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'owned implementation')
  expect(verify().status).toBe(0)
  writeFileSync(join(root, 'unowned.txt'), 'accidental edit\n')
  expect(verify().status).toBe(1)
  expect(verify().stdout).toContain('unowned.txt')
  rmSync(join(root, 'unowned.txt'))
  git('add', 'file.txt')
  expect(verify().status).toBe(1)
  expect(readFileSync(join(root, 'file.txt'), 'utf8')).toBe('user draft\n')
})

test('ownership guard protects pre-existing changes even inside allowed paths and pins baseline/checkout', () => {
  const { root, git } = repository()
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src/user.ts'), 'private draft')
  const wrongBase = protect(root, '--base', 'missing-integration-branch')
  expect(wrongBase.status).toBe(1)
  expect(protect(root, '--base', 'main').status).toBe(0)
  expect(protect(root).status).toBe(1)
  writeFileSync(join(root, 'src/user.ts'), 'overwritten')
  expect(run(root, 'check-protection', '--id', 'ownership').status).toBe(1)
  writeFileSync(join(root, 'src/user.ts'), 'private draft')
  git('switch', '-qc', 'other')
  expect(run(root, 'check-protection', '--id', 'ownership').status).toBe(1)
  expect(readFileSync(join(root, 'src/user.ts'), 'utf8')).toBe('private draft')
})

test('doctor separates the supported Node range from the verification baseline and checks browser/lockfile readiness', async () => {
  const { root } = repository()
  writeFileSync(join(root, 'package.json'), JSON.stringify({ engines: { node: '>=24' } }))
  writeFileSync(join(root, '.bun-version'), '1.4.3')
  writeFileSync(join(root, '.node-version'), process.versions.node.split('.')[0]!)
  writeFileSync(join(root, 'bun.lock'), 'fixture lock')
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true })
  symlinkSync(bun, join(root, 'node_modules/.bin/bun'))
  mkdirSync(join(root, 'node_modules/@playwright/test'), { recursive: true })
  writeFileSync(
    join(root, 'node_modules/@playwright/test/package.json'),
    JSON.stringify({ main: 'index.cjs', version: 'test' }),
  )
  const browser = join(root, 'chromium-fixture')
  writeFileSync(
    join(root, 'node_modules/@playwright/test/index.cjs'),
    `exports.chromium={executablePath:()=>${JSON.stringify(browser)}}`,
  )
  const server = createServer()
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP port')
  const port = address.port
  await new Promise<void>((done) => server.close(() => done()))
  const doctor = () => run(root, 'doctor', '--port', String(port))
  const missing = doctor()
  expect(missing.status).toBe(1)
  expect(JSON.parse(missing.stdout).browser.ready).toBe(false)
  writeFileSync(browser, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  const good = doctor()
  expect(good.status, good.stderr).toBe(0)
  expect(JSON.parse(good.stdout)).toMatchObject({
    node: { supported: true, baselineOkay: true },
    browser: { ready: true },
    lockfile: { present: true },
  })
  writeFileSync(join(root, '.node-version'), '999')
  const wrongBaseline = doctor()
  expect(wrongBaseline.status).toBe(1)
  expect(JSON.parse(wrongBaseline.stdout).node).toMatchObject({
    supported: true,
    baselineOkay: false,
  })
  writeFileSync(join(root, '.node-version'), process.versions.node.split('.')[0]!)
  rmSync(join(root, 'bun.lock'))
  expect(doctor().status).toBe(1)
})

test('the mechanical check rejects HTML-structure regex literals and constructors without banning text/URL regex', () => {
  const { root } = repository()
  mkdirSync(join(root, 'tests/e2e'), { recursive: true })
  const file = join(root, 'tests/e2e/ssr.spec.ts')
  const check = () =>
    spawnSync(bun, [checker, '--root', root], { encoding: 'utf8', env: fixtureEnv })
  for (const source of [
    String.raw`const identity = html.match(/<section\b[^>]*>.*?<\/section>/s)`,
    String.raw`const matcher = new RegExp('<section[^>]*>')`,
  ]) {
    writeFileSync(file, source)
    const rejected = check()
    expect(rejected.status).toBe(1)
    expect(rejected.stderr).toContain('ssr-html-parser')
  }
  writeFileSync(
    file,
    String.raw`// Example: /<section>/
const documentation = '/<section>/'
const text = /researcher|policy/
const url = /\/assets\/index\.lazy-[^/]+\.js$/
const document = new DOMParser().parseFromString(html, 'text/html')
`,
  )
  expect(check().status).toBe(0)
})

test('ownership protects a staged user draft whose working copy was restored to HEAD', () => {
  const { root, git } = repository()
  writeFileSync(join(root, 'file.txt'), 'staged user draft\n')
  git('add', 'file.txt')
  writeFileSync(join(root, 'file.txt'), 'original\n')
  const captured = run(root, 'protect', '--id', 'staged', '--allow', 'file.txt')
  expect(captured.status, captured.stderr).toBe(0)
  git('add', 'file.txt')
  const checked = run(root, 'check-protection', '--id', 'staged')
  expect(checked.status).toBe(1)
  expect(checked.stdout).toContain('index changed')
})

test('ownership rejects index-only staging outside the allowlist even when working bytes are restored', () => {
  const { root, git } = repository()
  expect(protect(root).status).toBe(0)
  writeFileSync(join(root, 'file.txt'), 'unowned staging\n')
  git('add', 'file.txt')
  writeFileSync(join(root, 'file.txt'), 'original\n')
  expect(run(root, 'check-protection', '--id', 'ownership').status).toBe(1)
})

test('a worker checks its scope before a separate merger integrates another disjoint branch', () => {
  const { root, git } = repository()
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src/a.ts'), 'a0')
  writeFileSync(join(root, 'src/b.ts'), 'b0')
  git('add', 'src')
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'shared baseline')
  git('switch', '-qc', 'worker-b')
  expect(
    run(root, 'protect', '--id', 'worker-b', '--base', 'main', '--allow', 'src/b.ts').status,
  ).toBe(0)
  writeFileSync(join(root, 'src/b.ts'), 'b1')
  git('add', 'src/b.ts')
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'worker B')
  expect(run(root, 'check-protection', '--id', 'worker-b').status).toBe(0)
  git('switch', 'main')
  writeFileSync(join(root, 'src/a.ts'), 'a1')
  git('add', 'src/a.ts')
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'worker A integrated')
  git('-c', 'core.hooksPath=/dev/null', 'merge', '--no-ff', 'worker-b', '-m', 'merger integrates B')
  expect(readFileSync(join(root, 'src/a.ts'), 'utf8')).toBe('a1')
  expect(readFileSync(join(root, 'src/b.ts'), 'utf8')).toBe('b1')
})

test('ownership refuses committing a pre-staged user draft even if its bytes and index stay unchanged', () => {
  const { root, git } = repository()
  writeFileSync(join(root, 'file.txt'), 'user staged draft\n')
  git('add', 'file.txt')
  expect(run(root, 'protect', '--id', 'staged-commit', '--allow', 'src/').status).toBe(0)
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'accidentally include user draft')
  const checked = run(root, 'check-protection', '--id', 'staged-commit')
  expect(checked.status).toBe(1)
  expect(checked.stdout).toContain('committed outside ownership')
  expect(readFileSync(join(root, 'file.txt'), 'utf8')).toBe('user staged draft\n')
})
