import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface TimeSlice {
  value: string
  label: string
  displayTime: string
}

interface TimeSliceSelectorProps {
  timeSlices: TimeSlice[]
  currentTime: string
  onTimeChange: (time: string) => void
  timezone?: string
  disabled?: boolean
}

export function TimeSliceSelector({
  timeSlices,
  currentTime,
  onTimeChange,
  timezone = 'UTC',
  disabled = false,
}: TimeSliceSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="time-slice-selector" className="text-sm font-medium">
        Time Slice ({timezone})
      </Label>
      <Select value={currentTime} onValueChange={onTimeChange} disabled={disabled}>
        <SelectTrigger id="time-slice-selector" className="w-[240px]">
          <SelectValue placeholder="Select time slice" />
        </SelectTrigger>
        <SelectContent>
          {timeSlices.map((slice) => (
            <SelectItem key={slice.value} value={slice.value}>
              {slice.displayTime}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
