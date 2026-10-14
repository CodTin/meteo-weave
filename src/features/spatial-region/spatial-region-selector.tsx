import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MapPin, RotateCcw } from 'lucide-react'
import {
  validateBoundingBox,
  calculateRegionDimensions,
  type BoundingBox,
  type ValidationErrors,
} from './validation'

interface CoordinateInputs {
  west: string
  south: string
  east: string
  north: string
}

interface SpatialRegionSelectorProps {
  onRegionConfirmed?: (bbox: BoundingBox) => void
}

export function SpatialRegionSelector({ onRegionConfirmed }: SpatialRegionSelectorProps) {
  const [inputs, setInputs] = useState<CoordinateInputs>({
    west: '',
    south: '',
    east: '',
    north: '',
  })
  const [confirmedRegion, setConfirmedRegion] = useState<BoundingBox | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})

  const handleInputChange = (field: keyof CoordinateInputs, value: string) => {
    setInputs((prev) => ({ ...prev, [field]: value }))
    // Clear validation error for this field when user starts typing
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleConfirm = () => {
    // Parse inputs to numbers
    const bbox: BoundingBox = {
      west: parseFloat(inputs.west),
      south: parseFloat(inputs.south),
      east: parseFloat(inputs.east),
      north: parseFloat(inputs.north),
    }

    // Validate
    const result = validateBoundingBox(bbox)

    if (!result.valid) {
      setValidationErrors(result.errors)
      return
    }

    // Clear errors and set confirmed region
    setValidationErrors({})
    setConfirmedRegion(result.bbox)
    onRegionConfirmed?.(result.bbox)
  }

  const handleReset = () => {
    setInputs({ west: '', south: '', east: '', north: '' })
    setConfirmedRegion(null)
    setValidationErrors({})
  }

  const canConfirm =
    inputs.west.trim() !== '' &&
    inputs.south.trim() !== '' &&
    inputs.east.trim() !== '' &&
    inputs.north.trim() !== ''

  const dimensions = confirmedRegion ? calculateRegionDimensions(confirmedRegion) : null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MapPin className="size-5 text-muted-foreground" aria-hidden="true" />
          <CardTitle>空间区域选择</CardTitle>
        </div>
        <CardDescription>
          通过经纬度坐标定义降尺度任务的空间区域。输入四个边界后确认选择。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="west-input" className="text-sm font-medium">
              西经（West）
            </label>
            <Input
              id="west-input"
              type="text"
              inputMode="decimal"
              placeholder="-180 到 180"
              value={inputs.west}
              onChange={(e) => handleInputChange('west', e.target.value)}
              aria-invalid={!!validationErrors.west}
              aria-describedby={validationErrors.west ? 'west-error' : undefined}
            />
            {validationErrors.west && (
              <p id="west-error" className="text-sm text-destructive" role="alert">
                {validationErrors.west}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="east-input" className="text-sm font-medium">
              东经（East）
            </label>
            <Input
              id="east-input"
              type="text"
              inputMode="decimal"
              placeholder="-180 到 180"
              value={inputs.east}
              onChange={(e) => handleInputChange('east', e.target.value)}
              aria-invalid={!!validationErrors.east}
              aria-describedby={validationErrors.east ? 'east-error' : undefined}
            />
            {validationErrors.east && (
              <p id="east-error" className="text-sm text-destructive" role="alert">
                {validationErrors.east}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="south-input" className="text-sm font-medium">
              南纬（South）
            </label>
            <Input
              id="south-input"
              type="text"
              inputMode="decimal"
              placeholder="-90 到 90"
              value={inputs.south}
              onChange={(e) => handleInputChange('south', e.target.value)}
              aria-invalid={!!validationErrors.south}
              aria-describedby={validationErrors.south ? 'south-error' : undefined}
            />
            {validationErrors.south && (
              <p id="south-error" className="text-sm text-destructive" role="alert">
                {validationErrors.south}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="north-input" className="text-sm font-medium">
              北纬（North）
            </label>
            <Input
              id="north-input"
              type="text"
              inputMode="decimal"
              placeholder="-90 到 90"
              value={inputs.north}
              onChange={(e) => handleInputChange('north', e.target.value)}
              aria-invalid={!!validationErrors.north}
              aria-describedby={validationErrors.north ? 'north-error' : undefined}
            />
            {validationErrors.north && (
              <p id="north-error" className="text-sm text-destructive" role="alert">
                {validationErrors.north}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            确认区域
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            disabled={
              !confirmedRegion &&
              inputs.west === '' &&
              inputs.south === '' &&
              inputs.east === '' &&
              inputs.north === ''
            }
          >
            <RotateCcw className="mr-2 size-4" aria-hidden="true" />
            重置
          </Button>
        </div>

        {confirmedRegion && dimensions && (
          <output
            className="rounded-lg border bg-muted/50 p-4 space-y-2 block"
            aria-label="已确认的区域信息"
          >
            <h3 className="font-medium">已确认区域</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">西经</dt>
                <dd className="font-mono">{confirmedRegion.west}°</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">东经</dt>
                <dd className="font-mono">{confirmedRegion.east}°</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">南纬</dt>
                <dd className="font-mono">{confirmedRegion.south}°</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">北纬</dt>
                <dd className="font-mono">{confirmedRegion.north}°</dd>
              </div>
            </dl>
            <div className="pt-2 border-t text-sm">
              <p className="text-muted-foreground">
                近似尺寸：约 {dimensions.widthKm.toFixed(1)} km（宽）× 约{' '}
                {dimensions.heightKm.toFixed(1)} km（高）
              </p>
            </div>
          </output>
        )}

        {!confirmedRegion && (
          <p className="text-sm text-muted-foreground">尚未选择区域。请输入四个坐标并确认。</p>
        )}
      </CardContent>
    </Card>
  )
}
