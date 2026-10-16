import { Loader2 } from 'lucide-react'

interface TaskLoadingStateProps {
  message?: string
}

export function TaskLoadingState({ message = '加载任务中...' }: TaskLoadingStateProps) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
