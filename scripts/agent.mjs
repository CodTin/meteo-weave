import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import {
  accessSync,
  constants,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { createConnection } from 'node:net'
import { createRequire } from 'node:module'
import { protectWorkspace, checkWorkspace } from './workspace-guard.mjs'

const [command = 'doctor', ...args] = process.argv.slice(2)
const options = {}
for (let i = 0; i < args.length; i += 2) {
  if (
    ![
      '--id',
      '--next',
      '--status',
      '--evidence',
      '--issues',
      '--port',
      '--allow',
      '--base',
    ].includes(args[i]) ||
    !args[i + 1]
  ) {
    throw new Error(`Unknown or incomplete option: ${args[i]}`)
  }
  options[args[i].slice(2)] = args[i + 1]
}
const json = (value) => console.log(JSON.stringify(value, null, 2))
const run = (file, argv, cwd = process.cwd()) =>
  execFileSync(file, argv, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
const git = (...argv) => run('git', argv)
const optional = (fn) => {
  try {
    return fn()
  } catch {
    return null
  }
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const root = git('rev-parse', '--show-toplevel')
process.chdir(root)

function snapshot() {
  const status = execFileSync('git', ['status', '--porcelain=v1', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
  const runtime = {
    node: process.versions.node,
    bun: optional(() => run(join(root, 'node_modules/.bin/bun'), ['--version'])),
  }
  // Store only digests, never environment-variable or .env contents in evidence.
  const config = createHash('sha256')
  for (const file of readdirSync(root)
    .filter((name) => name === '.env' || name.startsWith('.env.'))
    .sort()) {
    const path = join(root, file)
    if (lstatSync(path).isFile()) config.update(file).update(readFileSync(path))
  }
  const relevant = Object.keys(process.env)
    .filter((key) => /^(VITE_|SENTRY_|NITRO_|VERCEL|NODE_ENV$|CI$|E2E_PORT$|ANALYZE$)/.test(key))
    .sort()
  for (const key of relevant)
    config
      .update(key)
      .update('\0')
      .update(process.env[key] ?? '')
      .update('\0')
  const configurationFingerprint = config.digest('hex')
  const hash = createHash('sha256')
    .update(git('rev-parse', 'HEAD'))
    .update(status)
    .update(JSON.stringify(runtime))
    .update(configurationFingerprint)
  hash.update(
    execFileSync('git', ['diff', 'HEAD', '--binary'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }),
  )
  for (const file of git('ls-files', '--others', '--exclude-standard', '-z')
    .split('\0')
    .filter(Boolean)
    .sort()) {
    const path = join(root, file)
    hash.update(file).update('\0')
    hash.update(lstatSync(path).isSymbolicLink() ? readlinkSync(path) : readFileSync(path))
  }
  return {
    root,
    branch: optional(() => git('symbolic-ref', '--short', 'HEAD')),
    head: git('rev-parse', 'HEAD'),
    dirty: Boolean(status),
    changes: status.split('\0').filter(Boolean),
    fingerprint: hash.digest('hex'),
    configurationFingerprint,
    runtime,
  }
}
function stateFile() {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(options.id ?? ''))
    throw new Error('Provide a safe --id (letters, numbers, hyphens, underscores).')
  return join(
    git('rev-parse', '--path-format=absolute', '--git-common-dir'),
    'agent-runs',
    options.id,
    'checkpoint.json',
  )
}
function save(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(temporary, path)
}
async function portBusy(port) {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (busy) => {
      socket.destroy()
      resolvePort(busy)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(500, () => finish(true))
  })
}
async function doctor() {
  const packageJson = readJson(join(root, 'package.json'))
  const bun = join(root, 'node_modules/.bin/bun')
  const expectedBun = readFileSync(join(root, '.bun-version'), 'utf8').trim()
  const localBun = optional(() => run(bun, ['--version']))
  const nodeRange = packageJson.engines.node
  const nodeOkay =
    optional(() =>
      run(bun, [
        '-e',
        'console.log(Bun.semver.satisfies(process.argv[1], process.argv[2]))',
        process.versions.node,
        nodeRange,
      ]),
    ) === 'true'
  const baseline = readFileSync(join(root, '.node-version'), 'utf8').trim()
  const baselineOkay = process.versions.node.split('.')[0] === baseline
  const require = createRequire(join(root, 'package.json'))
  const browserPath = optional(() => require('@playwright/test').chromium.executablePath())
  const browserReady = Boolean(
    browserPath &&
    optional(() => {
      accessSync(browserPath, constants.X_OK)
      return true
    }),
  )
  const port = Number(options.port ?? process.env.E2E_PORT ?? 4173)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1–65535.')
  const occupied = await portBusy(port)
  const result = {
    ...snapshot(),
    node: {
      executable: process.execPath,
      actual: process.versions.node,
      supportedRange: nodeRange,
      supported: nodeOkay,
      baseline,
      baselineOkay,
    },
    browser: { name: 'chromium', executable: browserPath, ready: browserReady },
    bun: {
      localPath: bun,
      local: localBun,
      required: expectedBun,
      onPath: optional(() => run('bun', ['--version'])),
    },
    lockfile: {
      present: existsSync(join(root, 'bun.lock')),
      sha256: optional(() => sha256(readFileSync(join(root, 'bun.lock')))),
    },
    codegraph: existsSync(join(root, '.codegraph'))
      ? 'available in this checkout'
      : 'not indexed; use source tools without creating an index',
    port: { port, occupied },
  }
  json(result)
  if (
    !nodeOkay ||
    !baselineOkay ||
    !browserReady ||
    !result.lockfile.present ||
    localBun !== expectedBun ||
    occupied
  )
    process.exitCode = 1
}
async function verify() {
  const before = snapshot()
  const directory = join(root, 'reports/verification', `${before.head.slice(0, 12)}-${Date.now()}`)
  mkdirSync(directory, { recursive: true })
  const log = join(directory, 'check-all.log')
  const output = createWriteStream(log)
  const child = spawn(join(root, 'node_modules/.bin/bun'), ['run', 'check:all'], {
    cwd: root,
    env: { ...process.env, E2E_REUSE_BUILD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (data) => {
    process.stdout.write(data)
    output.write(data)
  })
  child.stderr.on('data', (data) => {
    process.stderr.write(data)
    output.write(data)
  })
  const exitCode = await new Promise((done) => {
    child.once('error', (error) => {
      output.write(String(error))
      done(1)
    })
    child.once('close', (code) => done(code ?? 1))
  })
  await new Promise((done) => output.end(done))
  const after = snapshot()
  const unchanged = before.head === after.head && before.fingerprint === after.fingerprint
  const report = {
    schemaVersion: 1,
    command: 'check:all',
    ...before,
    finishedAt: new Date().toISOString(),
    exitCode,
    unchanged,
    passed: exitCode === 0 && unchanged,
    log,
    logSha256: sha256(readFileSync(log)),
  }
  save(join(directory, 'result.json'), report)
  json({
    result: join(directory, 'result.json'),
    passed: report.passed,
    delivery: 'local verification only; use agent:delivery after authorized publication and CI',
  })
  if (!report.passed) process.exitCode = 1
}
function delivery() {
  const state = snapshot()
  if (state.dirty)
    throw new Error('Delivery requires a clean checkout; local work is not remotely delivered.')
  if (!state.branch) throw new Error('Delivery requires a named branch published to origin.')
  const remoteHead = optional(() =>
    git('ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${state.branch}`),
  )?.split(/\s/)[0]
  if (remoteHead !== state.head)
    throw new Error(
      'Publish this exact branch HEAD to origin with human authorization before delivery; no push was performed.',
    )
  const result = readJsonFromGh(
    `repos/{owner}/{repo}/actions/workflows/verify.yml/runs?head_sha=${state.head}&status=success&per_page=100`,
  )
  const evidence = result.workflow_runs?.find(
    (entry) =>
      entry.head_sha === state.head &&
      entry.status === 'completed' &&
      entry.conclusion === 'success' &&
      entry.path === '.github/workflows/verify.yml',
  )
  if (!evidence)
    throw new Error(
      'No successful Verify CI run exists for this exact HEAD; leave remote work open.',
    )
  json({
    status: 'deliverable',
    head: state.head,
    branch: state.branch,
    remote: 'origin',
    evidence: evidence.html_url,
    note: 'No issue was closed and no code was pushed.',
  })
}
function readJsonFromGh(endpoint) {
  return JSON.parse(run('gh', ['api', endpoint]))
}
function captureIssues() {
  const numbers = (options.issues ?? '').split(',')
  if (!numbers.length || !numbers.every((n) => /^[1-9]\d*$/.test(n)) || numbers.length > 20)
    throw new Error('Provide --issues with 1–20 comma-separated issue numbers.')
  const directory = join(dirname(stateFile()), 'issues')
  const index = []
  for (const number of new Set(numbers)) {
    const issue = JSON.parse(
      run('gh', ['issue', 'view', number, '--json', 'number,title,body,state,url,updatedAt']),
    )
    const blockers = readJsonFromGh(
      `repos/{owner}/{repo}/issues/${number}/dependencies/blocked_by`,
    ).map(({ number: blockedBy, state }) => ({ number: blockedBy, state }))
    const path = join(directory, `${number}.json`)
    save(path, { ...issue, blockers, capturedAt: new Date().toISOString() })
    index.push({ number: issue.number, title: issue.title, state: issue.state, blockers, path })
  }
  save(join(directory, 'index.json'), index)
  json(index)
}
try {
  switch (command) {
    case 'protect': {
      const path = join(dirname(stateFile()), 'protection.json')
      if (existsSync(path))
        throw new Error('Protection already exists; use a new task ID after inspecting changes.')
      const saved = protectWorkspace(root, options)
      save(path, saved)
      json({ path, baseline: saved.baseline, allowed: saved.allowed, preserved: saved.dirty })
      break
    }
    case 'check-protection': {
      const result = checkWorkspace(root, readJson(join(dirname(stateFile()), 'protection.json')))
      json(result)
      if (!result.passed) process.exitCode = 1
      break
    }
    case 'doctor':
      await doctor()
      break
    case 'checkpoint': {
      if (!options.next?.trim())
        throw new Error('A checkpoint requires --next with the concrete remaining action.')
      const status = options.status ?? 'active'
      if (!['active', 'blocked', 'local-complete'].includes(status))
        throw new Error(
          'Status must be active, blocked, or local-complete; remote delivery is separate.',
        )
      const path = stateFile()
      save(path, {
        schemaVersion: 1,
        ...snapshot(),
        id: options.id,
        status,
        next: options.next,
        evidence: options.evidence ?? null,
        updatedAt: new Date().toISOString(),
      })
      json({ path, status })
      break
    }
    case 'resume': {
      const saved = readJson(stateFile())
      const current = snapshot()
      const changed =
        saved.root !== current.root ||
        saved.head !== current.head ||
        saved.fingerprint !== current.fingerprint
      json({
        status: changed ? 'changed; inspect before continuing' : 'matching checkpoint',
        saved,
        current,
      })
      if (changed) process.exitCode = 1
      break
    }
    case 'verify':
      await verify()
      break
    case 'delivery':
      delivery()
      break
    case 'snapshot':
      captureIssues()
      break
    default:
      throw new Error(
        'Use doctor, protect, check-protection, checkpoint, resume, verify, delivery, or snapshot.',
      )
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
