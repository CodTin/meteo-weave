import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, resolve, basename } from 'node:path'

const root = resolve(process.argv[2] === '--root' ? (process.argv[3] ?? '.') : '.')
function files(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}
const failures: string[] = []
const scanner = new Bun.Transpiler({ loader: 'tsx' })
for (const file of files(join(root, 'tests/e2e')).filter((file) => /\.[cm]?[jt]sx?$/.test(file))) {
  if (relative(root, file) === 'tests/e2e/browser-guard.ts') continue
  // Parse imports/re-exports/require calls, not comments or string-literal lookalikes.
  const imports = scanner.scanImports(readFileSync(file, 'utf8'))
  if (imports.some(({ path }) => path === '@playwright/test' || path === 'playwright/test')) {
    failures.push(
      `${relative(root, file)}: use ./browser-guard for runtime Playwright imports; type-only imports remain allowed.`,
    )
  }
}
for (const file of files(join(root, 'src/routes')).filter((file) => /\.[jt]sx?$/.test(file))) {
  const stem = basename(file).replace(/(?:\.lazy)?\.[jt]sx?$/, '')
  if (stem.includes('.'))
    failures.push(
      `${relative(root, file)}: use directory-based routes, not dotted flat route names.`,
    )
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else console.log('Agent contracts passed: guarded browser tests and directory-based routes.')
