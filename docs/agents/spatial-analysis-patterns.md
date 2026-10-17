# Spatial Analysis Panel Patterns

## Shared Components

All spatial analysis panels share:

- `AnalysisContextCard` (task/time/region/variable display)
- `getVariableLabel()` utility
- Map placeholder structure
- Interpolation reference warnings

Import from `src/features/result-analysis/components/analysis-context-shared.tsx`.

## Panel Structure

1. **Analysis context** (reuse shared component)
2. **Prediction type controls** (if applicable: original vs downscaled)
3. **Statistics summary** (min/max/mean, valid points, unavailable breakdown)
4. **Map visualization area** (placeholder until map integration)
5. **Method description** (calculation formula, metadata, scientific caveats)
6. **Warnings** (interpolation reference, upsampling limitations, synthetic demo notice)

## Example

```tsx
import { AnalysisContextCard, getVariableLabel } from './analysis-context-shared'

export function MyAnalysisPanel({ taskId, timeSlice, region, variable }: Props) {
  return (
    <div className="space-y-6">
      <AnalysisContextCard
        taskId={taskId}
        time={timeSlice}
        region={region}
        variable={getVariableLabel(variable)}
      />
      {/* Your panel-specific content */}
    </div>
  )
}
```

## Common Utilities

- `calculateRmse()`, `calculateMae()`: Import from `metrics-utils.ts`
- `getVariableLabel()`: Import from `analysis-context-shared.tsx`
- Map placeholders: Use consistent "地图可视化区域（待集成地图组件）" text
