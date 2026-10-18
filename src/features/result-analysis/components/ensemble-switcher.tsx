import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EnsembleView } from '../hooks/use-ensemble-selection'

interface EnsembleSwitcherProps {
  view: EnsembleView
  onViewChange: (view: EnsembleView) => void
  allMemberIds: string[]
  effectiveK?: number
}

export function EnsembleSwitcher({
  view,
  onViewChange,
  allMemberIds,
  effectiveK,
}: EnsembleSwitcherProps) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="ensemble-view">Ensemble view</Label>
      <Select value={view} onValueChange={onViewChange}>
        <SelectTrigger id="ensemble-view" className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mean">Ensemble Mean</SelectItem>
          <SelectItem value="stddev">Standard Deviation</SelectItem>
          {allMemberIds.map((memberId) => (
            <SelectItem key={memberId} value={memberId}>
              {memberId.replace('member-', 'Member ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {effectiveK !== undefined && (view === 'mean' || view === 'stddev') && (
        <span className="text-sm text-muted-foreground">(K = {effectiveK} valid members)</span>
      )}
    </div>
  )
}
