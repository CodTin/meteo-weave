import { cn } from '@/lib/utils'

// One mark for the product entry, desktop sidebar and compact navigation.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      className={cn('size-10 shrink-0 text-ring', className)}
      fill="none"
    >
      <rect
        x=".75"
        y=".75"
        width="38.5"
        height="38.5"
        rx="8"
        fill="currentColor"
        fillOpacity=".08"
        stroke="currentColor"
        strokeOpacity=".35"
      />
      <path
        d="M7 14c5-9 9 9 14 0s8-1 12-1M7 21c5-9 9 9 14 0s8-1 12-1M7 28c5-9 9 9 14 0s8-1 12-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
