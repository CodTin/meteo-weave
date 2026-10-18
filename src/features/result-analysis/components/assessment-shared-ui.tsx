import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

/**
 * Shared header card for assessment panels
 */
export function AssessmentHeaderCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

/**
 * Shared info row for assessment details
 */
export function AssessmentInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <div className="font-medium text-foreground">{label}</div>
      <div className="text-muted-foreground">{value}</div>
    </div>
  )
}

/**
 * Shared unavailable state card
 */
export function AssessmentUnavailableCard({
  title,
  subtitle,
  reason,
}: {
  title: string
  subtitle: string
  reason: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertCircle className="size-4" />
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
