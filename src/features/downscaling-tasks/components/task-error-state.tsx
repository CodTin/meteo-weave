import { XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface TaskErrorStateProps {
  error: string
  actionLabel?: string
  actionIcon?: React.ReactNode
  onAction?: () => void
}

export function TaskErrorState({ error, actionLabel, actionIcon, onAction }: TaskErrorStateProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <XCircle className="size-5 text-destructive" />
          任务未找到
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-muted-foreground">{error}</p>
        {actionLabel && onAction && (
          <Button onClick={onAction}>
            {actionIcon}
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
