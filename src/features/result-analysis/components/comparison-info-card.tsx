import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Variable } from '../service/color-scales'
import type { AccumulationInterval } from '../service/comparison-data'

interface ComparisonInfoCardProps {
  taskId: string
  timeSlice: string
  region: {
    west: number
    east: number
    south: number
    north: number
  }
  variable: Variable
  accumulationInterval?: AccumulationInterval
}

export function ComparisonInfoCard({
  taskId,
  timeSlice,
  region,
  variable,
  accumulationInterval,
}: ComparisonInfoCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparison Info</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Task ID</dt>
            <dd className="font-mono text-xs">{taskId.slice(0, 8)}...</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {variable === 'precipitation' && accumulationInterval
                ? 'Accumulation End'
                : 'Time Slice'}
            </dt>
            <dd className="font-medium">{new Date(timeSlice).toISOString().slice(0, 16)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Region</dt>
            <dd className="font-medium">
              [{region.west.toFixed(1)}, {region.east.toFixed(1)}] × [{region.south.toFixed(1)},{' '}
              {region.north.toFixed(1)}]
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Color Scale</dt>
            <dd className="font-medium">Shared absolute (O/D/Obs) · Diverging (Diff)</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
