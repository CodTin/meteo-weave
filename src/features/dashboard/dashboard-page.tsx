import { Link } from '@tanstack/react-router'
import { ArrowRight, Unplug } from 'lucide-react'
import { ResolutionPreview } from '@/components/entry/resolution-preview'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
        在这里了解降尺度工作流程，并前往任务创建与管理。当前不提供业务统计或计算结果。
      </p>
      <Card className="surface-accent">
        <div className="grid items-center gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <CardHeader>
              <div className="status-icon">
                <Unplug className="size-5" aria-hidden="true" />
              </div>
              <p className="eyebrow mb-1">工作区导览 / PREVIEW</p>
              <CardTitle>身份认证与任务服务尚未接入</CardTitle>
              <CardDescription>
                当前为公开的工作区界面预览，不代表已登录。这里不会建立会话、读取任务或执行降尺度计算。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-7 text-muted-foreground">
                后续接入任务服务后，这里将汇总降尺度任务与结果分析入口；目前不显示任务数量、完成率或虚构记录。
              </p>
            </CardContent>
          </div>
          <CardContent className="mx-auto w-full max-w-xl">
            <ResolutionPreview />
          </CardContent>
        </div>
        <CardFooter className="flex-wrap border-t pt-6">
          <Link to="/tasks/new" className={buttonVariants()}>
            了解任务创建 <ArrowRight aria-hidden="true" />
          </Link>
          <Link to="/tasks" className={buttonVariants({ variant: 'outline' })}>
            查看任务管理
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
