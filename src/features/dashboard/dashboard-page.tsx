import { Link } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'
import { Unplug } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
        在这里了解降尺度工作流程，并前往任务创建与管理。当前不提供业务统计或计算结果。
      </p>
      <Card>
        <CardHeader>
          <Unplug className="mb-2 size-7 text-muted-foreground" aria-hidden="true" />
          <CardTitle>任务服务尚未接入</CardTitle>
          <CardDescription>
            当前演示账号显示在页面顶部。任务功能仍为预览，不会读取任务或执行降尺度计算。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-7 text-muted-foreground">
            后续接入任务服务后，这里将汇总降尺度任务与结果分析入口；目前不显示任务数量、完成率或虚构记录。
          </p>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Link to="/tasks/new" className={buttonVariants()}>
          了解任务创建
        </Link>
        <Link to="/tasks" className={buttonVariants({ variant: 'outline' })}>
          查看任务管理
        </Link>
      </div>
    </div>
  )
}
