import type { BoundingBox } from './validation'

export type PlaceCategory = 'city' | 'plain' | 'mountain'

export interface Place {
  id: string
  name: string
  nameEn: string
  category: PlaceCategory
  bbox: BoundingBox
  description: string
}

/**
 * Built-in demonstration place directory.
 *
 * This is NOT a global geocoding service. These are fixed, curated locations
 * for demonstration purposes only. Each place has a pre-defined bounding box
 * that complies with coordinate range, order, non-zero area, and no-dateline-crossing constraints.
 */
export const DEMO_PLACES: Place[] = [
  // Cities
  {
    id: 'beijing',
    name: '北京市区',
    nameEn: 'Beijing Urban Area',
    category: 'city',
    bbox: {
      west: 116.2,
      south: 39.8,
      east: 116.6,
      north: 40.1,
    },
    description: '中国首都核心城区，约 40×33 km',
  },
  {
    id: 'shanghai',
    name: '上海市区',
    nameEn: 'Shanghai Urban Area',
    category: 'city',
    bbox: {
      west: 121.3,
      south: 31.1,
      east: 121.7,
      north: 31.4,
    },
    description: '长江三角洲核心城市，约 40×33 km',
  },
  {
    id: 'chengdu',
    name: '成都平原',
    nameEn: 'Chengdu Plain',
    category: 'city',
    bbox: {
      west: 103.9,
      south: 30.5,
      east: 104.3,
      north: 30.8,
    },
    description: '西南地区中心城市，约 40×33 km',
  },

  // Plains
  {
    id: 'north-china-plain',
    name: '华北平原',
    nameEn: 'North China Plain',
    category: 'plain',
    bbox: {
      west: 114.0,
      south: 35.0,
      east: 117.0,
      north: 38.0,
    },
    description: '中国最大平原之一，约 285×333 km',
  },
  {
    id: 'yangtze-delta',
    name: '长江三角洲',
    nameEn: 'Yangtze River Delta',
    category: 'plain',
    bbox: {
      west: 119.5,
      south: 30.5,
      east: 122.0,
      north: 32.5,
    },
    description: '东部沿海经济核心区，约 235×222 km',
  },
  {
    id: 'northeast-plain',
    name: '东北平原',
    nameEn: 'Northeast China Plain',
    category: 'plain',
    bbox: {
      west: 123.0,
      south: 43.0,
      east: 127.0,
      north: 47.0,
    },
    description: '中国粮食主产区，约 355×444 km',
  },

  // Mountains
  {
    id: 'qinghai-tibet',
    name: '青藏高原东缘',
    nameEn: 'Eastern Qinghai-Tibet Plateau',
    category: 'mountain',
    bbox: {
      west: 100.0,
      south: 30.0,
      east: 103.0,
      north: 33.0,
    },
    description: '世界屋脊东部边缘，约 285×333 km',
  },
  {
    id: 'tianshan',
    name: '天山山脉',
    nameEn: 'Tianshan Mountains',
    category: 'mountain',
    bbox: {
      west: 86.0,
      south: 42.0,
      east: 90.0,
      north: 44.0,
    },
    description: '新疆中部山脉，约 355×222 km',
  },
  {
    id: 'qinling',
    name: '秦岭山脉',
    nameEn: 'Qinling Mountains',
    category: 'mountain',
    bbox: {
      west: 106.0,
      south: 33.0,
      east: 110.0,
      north: 34.5,
    },
    description: '中国南北地理分界线，约 380×166 km',
  },
]

/**
 * Search places by name (fuzzy matching on Chinese or English names)
 */
export function searchPlaces(query: string): Place[] {
  if (!query.trim()) {
    return DEMO_PLACES
  }

  const lowerQuery = query.toLowerCase().trim()

  return DEMO_PLACES.filter((place) => {
    const nameLower = place.name.toLowerCase()
    const nameEnLower = place.nameEn.toLowerCase()
    const descLower = place.description.toLowerCase()

    return (
      nameLower.includes(lowerQuery) ||
      nameEnLower.includes(lowerQuery) ||
      descLower.includes(lowerQuery)
    )
  })
}

/**
 * Get places by category
 */
export function getPlacesByCategory(category: PlaceCategory): Place[] {
  return DEMO_PLACES.filter((place) => place.category === category)
}

/**
 * Get a place by ID
 */
export function getPlaceById(id: string): Place | undefined {
  return DEMO_PLACES.find((place) => place.id === id)
}

/**
 * Category display names
 */
export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  city: '城市',
  plain: '平原',
  mountain: '山区',
}
