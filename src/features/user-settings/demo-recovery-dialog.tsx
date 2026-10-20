import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createTaskService } from '@/features/downscaling-tasks/service'
import type { DemoAccount } from '@/features/auth/demo-accounts'

type RecoveryState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ready'; missing: number; total: number }
  | { status: 'recovering' }
  | { status: 'success'; recovered: number; skipped: number }
  | { status: 'error'; message: string }

export function DemoRecoveryDialog({ account }: { account: DemoAccount }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<RecoveryState>({ status: 'idle' })
  const queryClient = useQueryClient()

  const checkMissing = async () => {
    setState({ status: 'checking' })
    try {
      const service = createTaskService({ queryClient })
      await service.initialize()
      const result = await service.getMissingCatalogTasks()
      setState({ status: 'ready', missing: result.missing.length, total: result.total })
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '检查失败',
      })
    }
  }

  const handleRecover = async () => {
    setState({ status: 'recovering' })
    try {
      const service = createTaskService({ queryClient })
      const result = await service.recoverCatalogTasks()
      if (result.ok) {
        setState({ status: 'success', recovered: result.recovered, skipped: result.skipped })
      } else {
        setState({
          status: 'error',
          message: `恢复失败：${result.failed.length} 个案例无法恢复`,
        })
      }
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '恢复失败',
      })
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen) {
      setState({ status: 'idle' })
      checkMissing()
    } else {
      setState({ status: 'idle' })
    }
  }

  const handleClose = () => {
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <RotateCcw className="size-4" aria-hidden="true" />
          恢复演示样例
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>恢复演示样例</DialogTitle>
          <DialogDescription>
            恢复当前账号（{account.roleLabel}
            ）缺失的固定演示案例。用户任务和其他账号记录不会被删除或覆盖。
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {state.status === 'checking' && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              正在检查缺失的案例...
            </div>
          )}

          {state.status === 'ready' && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/50 p-4">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">演示案例总数：</dt>
                    <dd className="font-medium">{state.total} 个</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">待恢复案例：</dt>
                    <dd className="font-medium">
                      {state.missing > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {state.missing} 个
                        </span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">无缺失</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              {state.missing === 0 ? (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                  所有演示案例均已存在，无需恢复。
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    将恢复 {state.missing} 个缺失的演示案例到当前账号。
                  </p>
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="mt-0.5 size-3 shrink-0" />
                    已存在的记录（包括同 ID 的用户任务）不会被覆盖。
                  </p>
                </div>
              )}
            </div>
          )}

          {state.status === 'recovering' && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              正在恢复演示案例...
            </div>
          )}

          {state.status === 'success' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/50">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">恢复成功</p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    已恢复 {state.recovered} 个演示案例
                    {state.skipped > 0 && `，跳过 ${state.skipped} 个已存在的记录`}。
                  </p>
                </div>
              </div>
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/50">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-900 dark:text-red-100">恢复失败</p>
                <p className="text-sm text-red-700 dark:text-red-300">{state.message}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {state.status === 'ready' && state.missing > 0 && (
            <>
              <Button variant="outline" onClick={handleClose}>
                取消
              </Button>
              <Button onClick={handleRecover}>确认恢复</Button>
            </>
          )}
          {(state.status === 'ready' && state.missing === 0) ||
            state.status === 'success' ||
            (state.status === 'error' && (
              <Button variant="outline" onClick={handleClose}>
                关闭
              </Button>
            ))}
          {state.status === 'error' && (
            <Button onClick={checkMissing} variant="outline">
              重试
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
