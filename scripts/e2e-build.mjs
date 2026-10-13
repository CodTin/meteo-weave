import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
process.chdir(root)
const bun = join(root, 'node_modules/.bin/bun')
const marker = join(root, '.output/agent-build.json')
const server = join(root, '.output/server/index.mjs')
const env = { ...process.env, NODE_ENV: 'production' }
const digest = (value) => createHash('sha256').update(value).digest('hex')
function hashFiles(paths) {
  const hash = createHash('sha256')
  function add(path, label) {
    if (!existsSync(path)) {
      hash.update(`missing:${label}\0`)
      return
    }
    const info = lstatSync(path)
    if (info.isSymbolicLink())
      throw new Error(`Build reuse does not accept symlink inputs or outputs: ${label}`)
    if (info.isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        if (name === 'agent-build.json' || (label === 'src' && name === 'routeTree.gen.ts'))
          continue
        add(join(path, name), `${label}/${name}`)
      }
    } else {
      hash.update(label).update('\0').update(String(info.mode)).update('\0')
      hash.update(readFileSync(path)).update('\0')
    }
  }
  for (const name of paths.sort()) add(join(root, name), name)
  return hash.digest('hex')
}
function inputs() {
  const configuration = Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => /^(VITE_|SENTRY_|NITRO_|VERCEL|NODE_|BUN_|CI$|ANALYZE$)/.test(key))
      .sort(),
  )
  const names = [
    'src',
    'public',
    'package.json',
    'bun.lock',
    '.bun-version',
    '.node-version',
    'tsconfig.json',
    'vite.config.ts',
    'vercel.json',
  ]
  names.push(...readdirSync(root).filter((name) => name === '.env' || name.startsWith('.env.')))
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const installed = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })
    .sort()
    .map((name) => {
      const path = join(root, 'node_modules', name, 'package.json')
      return [name, existsSync(path) ? digest(readFileSync(path)) : null]
    })
  // Hash secrets/configuration; never put their values in reports or diagnostics.
  return digest(
    JSON.stringify({
      root,
      source: hashFiles(names),
      configuration,
      installed,
      node: process.versions.node,
      bun: execFileSync(bun, ['--version'], { encoding: 'utf8' }).trim(),
      runner: digest(readFileSync(fileURLToPath(import.meta.url))),
    }),
  )
}
function assertBuild() {
  if (!existsSync(marker) || !existsSync(server))
    throw new Error('No verified production build. Run bun run e2e:build first.')
  const saved = JSON.parse(readFileSync(marker, 'utf8'))
  if (
    saved.schemaVersion !== 1 ||
    saved.root !== root ||
    saved.inputs !== inputs() ||
    saved.output !== hashFiles(['.output'])
  ) {
    throw new Error(
      'Production build is stale or belongs to another checkout. Run bun run e2e:build; nothing was started.',
    )
  }
  console.log(
    JSON.stringify({ status: 'reused', root, inputs: saved.inputs, builtAt: saved.builtAt }),
  )
}
function build() {
  rmSync(marker, { force: true })
  const before = inputs()
  execFileSync(bun, ['run', 'build'], { cwd: root, env, stdio: 'inherit' })
  if (inputs() !== before || !existsSync(server))
    throw new Error(
      'Build inputs changed during compilation or no server output exists; no reusable evidence written.',
    )
  const evidence = {
    schemaVersion: 1,
    root,
    inputs: before,
    output: hashFiles(['.output']),
    builtAt: new Date().toISOString(),
  }
  writeFileSync(marker, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify({ status: 'built', root, inputs: before }))
}
async function serve() {
  if (process.env.E2E_REUSE_BUILD === '1') assertBuild()
  else build()
  const child = spawn(bun, ['run', 'start'], { cwd: root, env, stdio: 'inherit' })
  const interrupt = () => child.kill('SIGINT')
  const terminate = () => child.kill('SIGTERM')
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
    })
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
}
try {
  switch (process.argv[2]) {
    case 'build':
      build()
      break
    case 'assert':
      assertBuild()
      break
    case 'serve':
      await serve()
      break
    default:
      throw new Error('Use build, assert, or serve.')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
