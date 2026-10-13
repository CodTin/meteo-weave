import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd()
const paths = (output) => output.split('\0').filter(Boolean)
function state(root) {
  const files = {}
  for (const name of new Set(
    paths(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard')),
  )) {
    try {
      const path = join(root, name)
      const info = lstatSync(path)
      const content = info.isSymbolicLink() ? readlinkSync(path) : readFileSync(path)
      files[name] = createHash('sha256')
        .update(String(info.mode))
        .update('\0')
        .update(content)
        .digest('hex')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      files[name] = null
    }
  }
  const index = Object.fromEntries(
    paths(git(root, 'ls-files', '--stage', '-z')).map((line) => {
      const tab = line.indexOf('\t')
      return [line.slice(tab + 1), line.slice(0, tab)]
    }),
  )
  const dirty = [
    ...new Set([
      ...paths(git(root, 'diff', '--cached', '--no-renames', '--name-only', '-z')),
      ...paths(git(root, 'diff', '--no-renames', '--name-only', '-z')),
      ...paths(git(root, 'ls-files', '--others', '--exclude-standard', '-z')),
    ]),
  ]
  return {
    root,
    head: git(root, 'rev-parse', 'HEAD'),
    branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD'),
    files,
    index,
    dirty,
  }
}
export function protectWorkspace(root, { base = 'HEAD', allow = '' }) {
  const allowed = allow.split(',').filter(Boolean)
  if (
    !allowed.length ||
    allowed.some(
      (path) =>
        path.startsWith('/') ||
        path.includes('\\') ||
        path.split('/').some((segment) => segment === '.' || segment === '..'),
    )
  ) {
    throw new Error(
      'Provide --allow with explicit repository-relative files or directories ending in /.',
    )
  }
  const baseline = git(root, 'rev-parse', '--verify', `${base}^{commit}`)
  const current = state(root)
  if (baseline !== current.head)
    throw new Error('The checkout must start at the exact --base integration commit.')
  return { schemaVersion: 1, ...current, baseline, allowed }
}
export function checkWorkspace(root, saved) {
  const current = state(root)
  const failures = []
  if (saved.root !== root || saved.branch !== current.branch)
    failures.push('checkout/branch changed')
  try {
    git(root, 'merge-base', '--is-ancestor', saved.baseline, current.head)
  } catch {
    failures.push('baseline is not an ancestor of HEAD')
  }
  const owns = (name) =>
    saved.allowed.some((scope) => (scope.endsWith('/') ? name.startsWith(scope) : name === scope))
  // A user draft can leave identical worktree/index bytes after commit: inspect the
  // commit delta too, not only ancestry and current mutable content.
  const committed = paths(
    git(root, 'diff', '--no-renames', '--name-only', '-z', saved.baseline, current.head),
  )
  for (const name of committed) {
    if (!owns(name) || saved.dirty.includes(name))
      failures.push(`${name} (committed outside ownership)`)
  }
  for (const name of new Set([...Object.keys(saved.files), ...Object.keys(current.files)])) {
    if ((!owns(name) || saved.dirty.includes(name)) && saved.files[name] !== current.files[name])
      failures.push(name)
  }
  // Preserve pre-existing index state as well as bytes; staging a user's draft is not harmless.
  for (const name of new Set([...Object.keys(saved.index), ...Object.keys(current.index)])) {
    if ((!owns(name) || saved.dirty.includes(name)) && saved.index[name] !== current.index[name])
      failures.push(`${name} (index changed)`)
  }
  return {
    passed: failures.length === 0,
    baseline: saved.baseline,
    head: current.head,
    failures: [...new Set(failures)],
  }
}
