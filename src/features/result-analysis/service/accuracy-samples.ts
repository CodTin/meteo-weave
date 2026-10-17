export type SamplePoint = {
  stationId: string
  time: string
  value: number
  location?: { lon: number; lat: number }
  elevation?: number
}

export type AlignedSample = {
  stationId: string
  time: string
  original: number
  downscaled: number
  observed: number
  location?: { lon: number; lat: number }
  elevation?: number
}

export type AlignmentResult = {
  samples: AlignedSample[]
  excluded: number
  duplicatesRemoved: number
}

export function alignAccuracySamples(
  original: SamplePoint[],
  downscaled: SamplePoint[],
  observation: SamplePoint[],
): AlignmentResult {
  // Create lookup maps for efficient matching and track duplicates
  const makeKey = (stationId: string, time: string) => `${stationId}|${time}`

  const originalMap = new Map<string, SamplePoint>()
  let originalDuplicates = 0
  for (const point of original) {
    const key = makeKey(point.stationId, point.time)
    if (originalMap.has(key)) {
      originalDuplicates++
    } else {
      originalMap.set(key, point)
    }
  }

  const downscaledMap = new Map<string, SamplePoint>()
  let downscaledDuplicates = 0
  for (const point of downscaled) {
    const key = makeKey(point.stationId, point.time)
    if (downscaledMap.has(key)) {
      downscaledDuplicates++
    } else {
      downscaledMap.set(key, point)
    }
  }

  const observationMap = new Map<string, SamplePoint>()
  let observationDuplicates = 0
  for (const point of observation) {
    const key = makeKey(point.stationId, point.time)
    if (observationMap.has(key)) {
      observationDuplicates++
    } else {
      observationMap.set(key, point)
    }
  }

  // Find common valid samples (all three present and finite)
  const aligned: AlignedSample[] = []
  let excluded = 0

  // Process each original entry to build aligned samples
  for (const [key, origData] of originalMap.entries()) {
    const downData = downscaledMap.get(key)
    const obsData = observationMap.get(key)

    // Check if all three values exist and are finite
    if (
      !downData ||
      !obsData ||
      !Number.isFinite(origData.value) ||
      !Number.isFinite(downData.value) ||
      !Number.isFinite(obsData.value)
    ) {
      excluded++
      continue
    }

    const stationId = key.split('|')[0]
    if (!stationId) continue

    aligned.push({
      stationId,
      time: origData.time,
      original: origData.value,
      downscaled: downData.value,
      observed: obsData.value,
      location: obsData.location || origData.location || downData.location,
      elevation: obsData.elevation ?? origData.elevation ?? downData.elevation,
    })
  }

  // Count excluded samples from downscaled and observation that weren't in original
  for (const key of downscaledMap.keys()) {
    if (!originalMap.has(key)) {
      excluded++
    }
  }
  for (const key of observationMap.keys()) {
    if (!originalMap.has(key) && !downscaledMap.has(key)) {
      excluded++
    }
  }

  // Total duplicates removed
  const duplicatesRemoved = originalDuplicates + downscaledDuplicates + observationDuplicates

  return {
    samples: aligned,
    excluded,
    duplicatesRemoved,
  }
}
