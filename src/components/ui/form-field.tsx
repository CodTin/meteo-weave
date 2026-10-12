import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'

export function FormField({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string
  label: string
  help: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      <p id={`${id}-help`} className="text-xs leading-6 text-muted-foreground">
        {help}
      </p>
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
