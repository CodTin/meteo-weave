import { parseSync, Visitor, type CallExpression, type NewExpression } from 'oxc-parser'
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
for (const file of files(join(root, 'tests')).filter((file) => /\.[cm]?[jt]sx?$/.test(file))) {
  if (relative(root, file) === 'tests/e2e/browser-guard.ts') continue
  // Parse imports/re-exports/require calls, not comments or string-literal lookalikes.
  const source = readFileSync(file, 'utf8')
  const imports = scanner.scanImports(source)
  const parsed = parseSync(file, source)
  for (const error of parsed.errors) failures.push(`${relative(root, file)}: ${error.message}`)
  function checkPattern(pattern: string, start: number) {
    // Tag syntax only; ordinary text/URL regex and comment/string examples remain allowed.
    if (/<(?:\\?\/)?[a-z][a-z0-9:-]*(?:\\b|[\s>[(])/i.test(pattern)) {
      const line = source.slice(0, start).split('\n').length
      failures.push(
        `${relative(root, file)}:${line}: ssr-html-parser: parse returned HTML with DOMParser instead of matching tag/attribute structure with regex.`,
      )
    }
  }
  function checkConstructor(node: CallExpression | NewExpression) {
    if (node.callee.type !== 'Identifier' || node.callee.name !== 'RegExp') return
    const argument = node.arguments[0]
    if (argument?.type === 'Literal' && typeof argument.value === 'string')
      checkPattern(argument.value, node.start)
    if (argument?.type === 'TemplateLiteral' && argument.expressions.length === 0)
      checkPattern(argument.quasis[0]?.value.cooked ?? '', node.start)
  }
  new Visitor({
    Literal(node) {
      if ('regex' in node) checkPattern(node.regex.pattern, node.start)
    },
    CallExpression: checkConstructor,
    NewExpression: checkConstructor,
  }).visit(parsed.program)
  if (
    imports.some(({ path }) =>
      ['@playwright/test', 'playwright/test', 'playwright', 'playwright-core'].includes(path),
    )
  ) {
    failures.push(
      `${relative(root, file)}: use tests/e2e/browser-guard for runtime Playwright imports; type-only imports remain allowed.`,
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
// Ban manual UTC offset arithmetic for named timezones - use date-fns-tz or Temporal instead
for (const file of files(join(root, 'src')).filter((file) => /\.[cm]?[jt]sx?$/.test(file))) {
  const source = readFileSync(file, 'utf8')
  const tzOffsetPattern = /Date\.UTC\([^)]+\)\s*[-+]\s*\d+\s*\*\s*60\s*\*\s*60\s*\*\s*1000/
  if (tzOffsetPattern.test(source)) {
    const line = source.slice(0, source.search(tzOffsetPattern)).split('\n').length
    failures.push(
      `${relative(root, file)}:${line}: timezone-handling: use date-fns-tz fromZonedTime() or Temporal for timezone conversion, not manual offset arithmetic which ignores DST.`,
    )
  }
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else
  console.log(
    'Agent contracts passed: guarded browser tests, parsed SSR HTML, directory-based routes and proper timezone handling.',
  )
