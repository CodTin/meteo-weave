import { Link } from '@tanstack/react-router'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function TaskCreatePage() {
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
        配置一次降尺度计算请求：从数据源到时空范围、气象变量、降尺度方法与目标分辨率。
      </p>
      <Card>
        <CardHeader>
          <CardTitle>任务配置与计算尚未接入</CardTitle>
          <CardDescription id="task-create-status">
            当前仅说明配置流程，不采集参数，也不会提交、保存或模拟执行降尺度任务。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-5 md:grid-cols-3">
            {[
              ['01', '选择输入', '确定数据源、气象变量、空间区域与时间范围。'],
              ['02', '定义降尺度配置', '选择降尺度方法与目标分辨率。'],
              ['03', '提交与分析', '服务接入后提交任务，查看任务状态与结果分析。'],
            ].map(([step, title, description]) => (
              <li key={step} className="rounded-lg border bg-background p-4">
                <span className="font-mono text-xs text-muted-foreground">{step}</span>
                <h3 className="mt-3 text-sm font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
              </li>
            ))}
          </ol>
        </CardContent>
        <CardFooter className="flex-wrap">
          <Button disabled aria-describedby="task-create-status">
            提交降尺度任务
          </Button>
          <Link to="/tasks" className={buttonVariants({ variant: 'outline' })}>
            查看任务管理
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
