import '@tanstack/react-start/server-only'
import { z } from 'zod'
import {
  demoCatalogFor,
  isCanonicalCatalogTask,
} from '@/features/downscaling-tasks/service/demo-catalog'
import { getDownscalingCapabilities } from '@/features/downscaling-tasks/capabilities'
import { validateTaskRecord } from '@/features/downscaling-tasks/service/record-validation'
import {
  resultAvailability,
  probeTaskResult,
  queryTaskResult,
} from '@/features/downscaling-tasks/service/result-queries'
import { admitDownscalingConfiguration } from './downscaling-admission.server'
import { requireDemoAccount } from './demo-session.server'
import {
  OBSERVATION_REFERENCE,
  GENERATOR_VERSION,
  VARIABLE_GENERATOR_VERSION,
  ENSEMBLE_GENERATOR_VERSION,
  TASK_SCHEMA_VERSION,
  TASK_DURATION_MS,
  unavailable,
  type ResultReply,
  type TaskReply,
} from '@/features/downscaling-tasks/service/contracts'

export function submitDownscalingTask(input: unknown): TaskReply {
  // Admission and persisted timestamps must describe the same server-owned instant.
  const now = Date.now()
  const admission = admitDownscalingConfiguration(input, now)
  if (!admission.ok) return admission
  const generatorVersion =
    admission.configuration.resolvedMethod === 'probabilistic'
      ? ENSEMBLE_GENERATOR_VERSION
      : admission.configuration.variable === 'temperature'
        ? GENERATOR_VERSION
        : VARIABLE_GENERATOR_VERSION
  const unavailableResult = resultAvailability({
    configuration: admission.configuration,
    generatorVersion,
  })
  if (unavailableResult) return unavailableResult
  const id = crypto.randomUUID()

  // Generate name: use admission.name for Spec 05, fallback to old format for backward compatibility
  const taskName =
    'name' in admission && admission.name
      ? admission.name
      : `Synthetic Demo · ${{ temperature: 'Temperature', wind: 'Wind', pressure: 'MSL Pressure', precipitation: 'Precipitation' }[admission.configuration.variable]} · ${id}`

  return {
    ok: true,
    task: {
      schemaVersion: TASK_SCHEMA_VERSION,
      id,
      name: taskName,
      ownerId: admission.ownerId,
      configuration: admission.configuration,
      createdAt: new Date(now).toISOString(),
      submittedAt: new Date(now).toISOString(),
      completionAt: new Date(now + TASK_DURATION_MS).toISOString(),
      status: 'Running',
      failureReason: null,
      dataSeed: crypto.getRandomValues(new Uint32Array(1))[0]!,
      generatorVersion,
      ...OBSERVATION_REFERENCE,
    },
  }
}

function ownedRecord(input: unknown, allowCanonicalRead = false): TaskReply {
  const account = requireDemoAccount()
  if (
    !input ||
    typeof input !== 'object' ||
    !('ownerId' in input) ||
    input.ownerId !== account.id
  ) {
    return unavailable('NOT_FOUND', 'Task not found for the current Demo account.')
  }
  const parsed = validateTaskRecord(input)
  if (!parsed.ok) return parsed
  if (allowCanonicalRead && isCanonicalCatalogTask(parsed.task)) return parsed
  const capabilities = getDownscalingCapabilities(account)
  const configuration = parsed.task.configuration
  if (
    !capabilities.methods.some((method) => method === configuration.method) ||
    (!capabilities.allowsAdvanced && configuration.advanced !== undefined)
  ) {
    return unavailable(
      'ROLE_RESTRICTED',
      'Saved configuration is not allowed for this Demo account.',
    )
  }
  return parsed
}

export function readDownscalingTask(input: unknown): TaskReply {
  const parsed = ownedRecord(input, true)
  if (!parsed.ok) return parsed
  const task = parsed.task
  if (task.status === 'Failed') return parsed
  if (task.status === 'Running' && Date.now() < Date.parse(task.completionAt)) return parsed
  const failure = probeTaskResult(task)
  return {
    ok: true,
    task: {
      ...task,
      status: failure ? 'Failed' : 'Completed',
      failureReason: failure?.error ?? null,
    },
  }
}

export function restoreDownscalingTask(input: unknown): TaskReply {
  return ownedRecord(input)
}

export function queryDownscalingTaskResult(input: unknown): ResultReply {
  requireDemoAccount()
  const request = z.object({ task: z.unknown(), query: z.unknown() }).safeParse(input)
  if (!request.success)
    return unavailable('UNAVAILABLE_QUERY', 'A saved task and query are required.')
  const read = readDownscalingTask(request.data.task)
  if (!read.ok) return read
  const availability = resultAvailability(read.task)
  if (availability) return availability
  if (read.task.status !== 'Completed')
    return unavailable(
      read.task.status.toUpperCase(),
      read.task.failureReason ?? 'Task is still running.',
    )
  return queryTaskResult(read.task, request.data.query)
}

export function getDemoTaskCatalog() {
  const account = requireDemoAccount()
  return { ownerId: account.id, tasks: demoCatalogFor(account.id) }
}
