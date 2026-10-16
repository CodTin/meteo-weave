/**
 * Event threshold definition for extreme event analysis
 */
export type EventThreshold = {
  value: number
  direction: 'greater' | 'less'
  inclusive: boolean
  unit: string
  variable: string
}

/**
 * Accumulation interval definition for precipitation and other accumulated variables
 */
export type AccumulationInterval = {
  interval: string // e.g., '24h', '6h', '1h'
  description: string // e.g., '24小时累计降水'
}

/**
 * Complete event assessment definition including threshold and optional accumulation
 */
export type EventAssessmentDefinition = {
  threshold: EventThreshold
  accumulation?: AccumulationInterval
}

/**
 * Event classification counts
 */
export type EventCounts = {
  truePositives: number // TP: event occurred and was predicted
  falsePositives: number // FP: event predicted but did not occur
  falseNegatives: number // FN: event occurred but was not predicted
  trueNegatives: number // TN: no event and none predicted
}

/**
 * Event metrics result
 */
export type EventMetrics =
  | {
      available: true
      hitRate: number // TP / (TP + FN)
      precision: number // TP / (TP + FP)
      counts: EventCounts
    }
  | {
      available: false
      reason: string
      counts: EventCounts
    }

/**
 * Complete event assessment result including definition
 */
export type EventAssessmentResult =
  | {
      available: true
      hitRate: number
      precision: number
      counts: EventCounts
      n: number
      definition: EventAssessmentDefinition
    }
  | {
      available: false
      reason: string
      counts: EventCounts
      definition: EventAssessmentDefinition
    }

/**
 * Checks if a value meets the threshold criteria for an event
 */
function isEvent(value: number, threshold: EventThreshold): boolean {
  if (!Number.isFinite(value)) {
    return false
  }

  if (threshold.direction === 'greater') {
    return threshold.inclusive ? value >= threshold.value : value > threshold.value
  } else {
    return threshold.inclusive ? value <= threshold.value : value < threshold.value
  }
}

/**
 * Classifies events based on observed and predicted values against a threshold
 */
export function classifyEvents(
  observed: number[],
  predicted: number[],
  threshold: EventThreshold,
): EventCounts {
  if (observed.length !== predicted.length) {
    throw new Error('Sample count mismatch')
  }

  if (observed.length === 0) {
    throw new Error('No samples provided')
  }

  let truePositives = 0
  let falsePositives = 0
  let falseNegatives = 0
  let trueNegatives = 0

  for (let i = 0; i < observed.length; i++) {
    const obs = observed[i]!
    const pred = predicted[i]!

    // Skip samples with NaN values
    if (!Number.isFinite(obs) || !Number.isFinite(pred)) {
      continue
    }

    const observedEvent = isEvent(obs, threshold)
    const predictedEvent = isEvent(pred, threshold)

    if (observedEvent && predictedEvent) {
      truePositives++
    } else if (!observedEvent && predictedEvent) {
      falsePositives++
    } else if (observedEvent && !predictedEvent) {
      falseNegatives++
    } else {
      trueNegatives++
    }
  }

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    trueNegatives,
  }
}

/**
 * Calculates event metrics (hit rate and precision) from event counts
 */
export function calculateEventMetrics(counts: EventCounts): EventMetrics {
  const { truePositives, falsePositives, falseNegatives } = counts

  // Check denominators
  const observedEvents = truePositives + falseNegatives // TP + FN
  const predictedEvents = truePositives + falsePositives // TP + FP

  // Handle cases where metrics cannot be calculated
  if (observedEvents === 0 && predictedEvents === 0) {
    return {
      available: false,
      reason: '命中率不可用（无观测事件），精确率不可用（无预测预警）',
      counts,
    }
  }

  if (observedEvents === 0) {
    return {
      available: false,
      reason: '命中率不可用（无观测事件）',
      counts,
    }
  }

  if (predictedEvents === 0) {
    return {
      available: false,
      reason: '精确率不可用（无预测预警）',
      counts,
    }
  }

  // Calculate metrics
  const hitRate = truePositives / observedEvents
  const precision = truePositives / predictedEvents

  return {
    available: true,
    hitRate,
    precision,
    counts,
  }
}

/**
 * Performs complete event assessment including classification and metric calculation
 */
export function assessEvents(
  observed: number[],
  predicted: number[],
  definition: EventAssessmentDefinition,
): EventAssessmentResult {
  // Classify events
  const counts = classifyEvents(observed, predicted, definition.threshold)

  // Count valid samples (excluding NaN)
  let validSamples = 0
  for (let i = 0; i < observed.length; i++) {
    if (Number.isFinite(observed[i]) && Number.isFinite(predicted[i])) {
      validSamples++
    }
  }

  // Calculate metrics
  const metrics = calculateEventMetrics(counts)

  if (metrics.available) {
    return {
      available: true,
      hitRate: metrics.hitRate,
      precision: metrics.precision,
      counts: metrics.counts,
      n: validSamples,
      definition,
    }
  } else {
    return {
      available: false,
      reason: metrics.reason,
      counts: metrics.counts,
      definition,
    }
  }
}
