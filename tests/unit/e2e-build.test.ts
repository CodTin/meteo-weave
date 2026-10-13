import { afterEach, expect, test } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  cpSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve('scripts/e2e-build.mjs')
const temporary: string[] = []
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
)
afterEach(() =>
  temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })),
)
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'meteo-build-evidence-'))
  temporary.push(root)
  for (const name of ['src', 'public', 'tests/e2e', 'node_modules/.bin'])
    mkdirSync(join(root, name), { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root, env: environment })
  writeFileSync(join(root, 'src/main.ts'), 'export const message = "original"\n')
  writeFileSync(join(root, 'package.json'), '{}')
  writeFileSync(join(root, 'bun.lock'), 'lock')
  // External build tool stand-in; test the public cache CLI, not internal fingerprint functions.
  writeFileSync(
    join(root, 'node_modules/.bin/bun'),
    `#!/usr/bin/env node
const fs = require('node:fs')
if (process.argv.includes('--version')) console.log('1.4.3')
else {
 fs.mkdirSync('.output/server', {recursive:true})
 fs.writeFileSync('.output/server/index.mjs', 'server output')
 if (process.env.MUTATE_DURING_BUILD) fs.writeFileSync('src/main.ts','changed while building')
 if (process.env.FAIL_BUILD) process.exit(2)
}
`,
    { mode: 0o755 },
  )
  return root
}
function run(root: string, command: string, env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script, command], {
    cwd: root,
    encoding: 'utf8',
    env: { ...environment, ...env },
  })
}

test('reuse requires a successful build with matching app inputs; test-only edits do not rebuild', () => {
  const root = fixture()
  expect(run(root, 'assert').status).toBe(1)
  const built = run(root, 'build')
  expect(built.status, built.stderr).toBe(0)
  expect(run(root, 'assert').status).toBe(0)
  writeFileSync(join(root, 'tests/e2e/new.spec.ts'), '// new test only')
  expect(run(root, 'assert').status).toBe(0)
  writeFileSync(join(root, 'src/main.ts'), 'new app code')
  expect(run(root, 'assert').status).toBe(1)
  expect(readFileSync(join(root, '.output/server/index.mjs'), 'utf8')).toBe('server output')
})

test('reuse rejects changed outputs, lockfile, ignored config, environment, or a copied build', () => {
  const root = fixture()
  const refresh = () => expect(run(root, 'build', { VITE_PUBLIC_FLAG: 'before' }).status).toBe(0)
  const check = () => run(root, 'assert', { VITE_PUBLIC_FLAG: 'before' })
  refresh()
  writeFileSync(join(root, '.output/server/index.mjs'), 'tampered')
  expect(check().status).toBe(1)
  refresh()
  writeFileSync(join(root, 'bun.lock'), 'new lock')
  expect(check().status).toBe(1)
  refresh()
  writeFileSync(join(root, '.env.local'), 'PRIVATE_CANARY=secret')
  const changed = check()
  expect(changed.status).toBe(1)
  expect(changed.stdout + changed.stderr).not.toContain('PRIVATE_CANARY')
  refresh()
  expect(run(root, 'assert', { VITE_PUBLIC_FLAG: 'after' }).status).toBe(1)
  const other = fixture()
  cpSync(join(root, '.output'), join(other, '.output'), { recursive: true })
  expect(run(other, 'assert', { VITE_PUBLIC_FLAG: 'before' }).status).toBe(1)
})

test('a failed or concurrently changed build never produces reusable evidence', () => {
  const root = fixture()
  expect(run(root, 'build').status).toBe(0)
  expect(run(root, 'build', { FAIL_BUILD: '1' }).status).toBe(1)
  expect(run(root, 'assert').status).toBe(1)
  expect(run(root, 'build', { MUTATE_DURING_BUILD: '1' }).status).toBe(1)
  expect(run(root, 'assert').status).toBe(1)
})

test('reuse fails closed on symlinked configuration or output, including links to external files', () => {
  const root = fixture()
  const external = mkdtempSync(join(tmpdir(), 'meteo-build-secret-'))
  temporary.push(external)
  writeFileSync(join(external, 'config'), 'PRIVATE_SYMLINK_CANARY=before')
  symlinkSync(join(external, 'config'), join(root, '.env.local'))
  const rejected = run(root, 'build')
  expect(rejected.status).toBe(1)
  expect(rejected.stderr).toContain('symlink')
  expect(rejected.stdout + rejected.stderr).not.toContain('PRIVATE_SYMLINK_CANARY')
  rmSync(join(root, '.env.local'))
  expect(run(root, 'build').status).toBe(0)
  symlinkSync(join(external, 'config'), join(root, '.output/extra'))
  expect(run(root, 'assert').status).toBe(1)
})
