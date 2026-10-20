import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { resultMapEvidence } from '../e2e/helpers/result-map-evidence'

const temporary: string[] = []
afterEach(() =>
  temporary.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })),
)

test('the public agent guard rejects developer-home defaults for result-map artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'result-map-evidence-'))
  temporary.push(root)
  mkdirSync(join(root, 'tests/e2e'), { recursive: true })
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, '.jscpd.json'), '{}')
  writeFileSync(
    join(root, 'tests/e2e/result-map-rendering.spec.ts'),
    `import { resultMapEvidence } from './helpers/result-map-evidence'
const evidence = process.env.RESULT_MAP_EVIDENCE_DIR ?? '/home/developer/private/result-map'
`,
  )
  const result = spawnSync(
    resolve('node_modules/.bin/bun'),
    [resolve('scripts/check-agent-contracts.ts'), '--root', root],
    {
      cwd: root,
      encoding: 'utf8',
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
      ),
    },
  )
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('result-map-evidence:')
})

test('run-local artifacts use the framework output path and attach; explicit local runs do not collide', async () => {
  const root = mkdtempSync(join(tmpdir(), 'result-map-output-'))
  temporary.push(root)
  const attachments: string[] = []
  const testInfo = {
    outputDir: join(root, 'worker-test'),
    outputPath: (...names: string[]) => join(root, 'worker-test', ...names),
    attach: async (_name: string, options: { path?: string }) => {
      if (options.path) attachments.push(options.path)
    },
  }
  await resultMapEvidence(testInfo).json('public-evidence', { value: 3.237 })
  expect(attachments[0]).toBe(join(root, 'worker-test', 'public-evidence.json'))
  expect(JSON.parse(readFileSync(attachments[0]!, 'utf8'))).toEqual({ value: 3.237 })
  const firstLocal = resultMapEvidence(testInfo, join(root, 'local'))
  const secondLocal = resultMapEvidence(testInfo, join(root, 'local'))
  await firstLocal.json('public-evidence', { value: 1 })
  await secondLocal.json('public-evidence', { value: 2 })
  expect(attachments[1]).not.toBe(attachments[2])
  expect(attachments.slice(1).every((path) => path.startsWith(join(root, 'local')))).toBe(true)
})
