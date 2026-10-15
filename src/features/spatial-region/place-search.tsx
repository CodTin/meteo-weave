import { useState, useId } from 'react'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Search, MapPin, Mountain, Building2, Layers } from 'lucide-react'
import { searchPlaces, CATEGORY_LABELS, type Place } from './places'
import type { BoundingBox } from './validation'

interface PlaceSearchProps {
  onPlaceSelected?: (bbox: BoundingBox, place: Place) => void
  disabled?: boolean
}

export function PlaceSearch({ onPlaceSelected, disabled = false }: PlaceSearchProps) {
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const searchId = useId()
  const resultsId = useId()

  const results = searchPlaces(query)

  const handleSelectPlace = (place: Place) => {
    setQuery(place.name)
    setShowResults(false)
    onPlaceSelected?.(place.bbox, place)
  }

  const handleInputChange = (value: string) => {
    setQuery(value)
    setShowResults(true)
  }

  const handleInputFocus = () => {
    setShowResults(true)
  }

  const handleInputBlur = () => {
    // Delay to allow click on result
    setTimeout(() => setShowResults(false), 200)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowResults(false)
    }
  }

  const getCategoryIcon = (category: Place['category']) => {
    switch (category) {
      case 'city':
        return <Building2 className="size-4" aria-hidden="true" />
      case 'plain':
        return <Layers className="size-4" aria-hidden="true" />
      case 'mountain':
        return <Mountain className="size-4" aria-hidden="true" />
    }
  }

  const hasResults = results.length > 0
  const showNoResults = query.trim() !== '' && !hasResults && showResults

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label htmlFor={searchId} className="text-sm font-medium">
          搜索演示地点
        </label>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={searchId}
            type="text"
            placeholder="搜索城市、平原或山区..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="pl-9"
            aria-describedby={resultsId}
          />
        </div>
      </div>

      <Alert>
        <MapPin className="size-4" aria-hidden="true" />
        <AlertDescription>
          这是内置演示目录，包含精选的中国地区示例（城市、平原、山区）。这不是全球地理编码服务。
        </AlertDescription>
      </Alert>

      {showResults && hasResults && (
        <div id={resultsId} aria-label="搜索结果" className="rounded-lg border bg-card shadow-sm">
          <div className="max-h-[300px] overflow-y-auto">
            {results.map((place) => (
              <button
                key={place.id}
                type="button"
                aria-label={`选择 ${place.name}`}
                onClick={() => handleSelectPlace(place)}
                disabled={disabled}
                className="w-full text-left px-4 py-3 hover:bg-muted/50 focus:bg-muted focus:outline-none disabled:opacity-50 disabled:pointer-events-none border-b last:border-b-0 transition-colors"
                data-testid={`place-option-${place.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-muted-foreground">
                    {getCategoryIcon(place.category)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{place.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {CATEGORY_LABELS[place.category]}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">{place.nameEn}</div>
                    <div className="text-sm text-muted-foreground">{place.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showNoResults && (
        <Alert>
          <AlertDescription>
            未找到匹配的地点。目录仅包含精选演示区域。您可以使用下方坐标输入定义任意区域。
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
