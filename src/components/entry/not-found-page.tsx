import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, MapPinOff } from 'lucide-react'
import { EntryShell } from '@/components/entry/entry-shell'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <EntryShell>
      <div className="mx-auto max-w-2xl py-4 sm:py-12">
        <Card className="surface-error gap-8 py-8 sm:py-10">
          <CardContent>
            <p className="mb-7 flex items-center gap-2 font-mono text-xs tracking-widest text-destructive">
              <MapPinOff className="size-4" aria-hidden="true" /> HTTP 404 / NOT FOUND
            </p>
            <p
              className="mb-6 font-mono text-8xl font-medium tracking-tight text-destructive sm:text-9xl"
              aria-hidden="true"
            >
              404
            </p>
            <h1 className="page-heading">找不到这个页面</h1>
            <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground">
              这个地址不存在，或页面已经移动。请检查地址是否正确，也可以返回平台入口，继续了解气象降尺度演示。
            </p>
          </CardContent>
          <CardFooter className="flex-col items-stretch border-t pt-6 sm:flex-row">
            <Link to="/" className={buttonVariants()}>
              <ArrowLeft aria-hidden="true" />
              返回平台入口
            </Link>
            <Link to="/login" className={buttonVariants({ variant: 'outline' })}>
              前往登录
              <ArrowRight aria-hidden="true" />
            </Link>
          </CardFooter>
        </Card>
      </div>
    </EntryShell>
  )
}
