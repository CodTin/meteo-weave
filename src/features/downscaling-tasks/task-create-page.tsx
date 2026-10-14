import { SlidersHorizontal } from 'lucide-react'
import { Link, useRouteContext } from '@tanstack/react-router'
import { getDownscalingCapabilities, type DownscalingMethod } from './capabilities'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const methodLabels: Record<DownscalingMethod, string> = {
  recommended: '推荐方法',
  deterministic: '确定性方法',
  probabilistic: '概率式方法',
}

export function TaskCreatePage() {
  const { account } = useRouteContext({ from: '/_workspace' })
  const capabilities = getDownscalingCapabilities(account)
  return (
    <Card className="surface-accent gap-4 py-4">
      <CardHeader>
        <div className="status-icon">
          <SlidersHorizontal className="size-5" aria-hidden="true" />
        </div>
        <CardTitle>任务配置与计算尚未接入</CardTitle>
        <CardDescription id="task-create-status">
          当前提供角色能力与配置准入规则，不采集参数，不提交、保存或模拟执行任务。配置通过检查不代表任务已创建。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <section aria-label="当前角色的配置能力" className="space-y-2 text-sm leading-6">
          <h3 className="font-medium">{account.roleLabel} · 配置能力</h3>
          <ul aria-label="可用降尺度方法" className="flex flex-wrap gap-2">
            {capabilities.methods.map((method) => (
              <li key={method} className="rounded-md border px-3 py-1">
                {methodLabels[method]}
              </li>
            ))}
          </ul>
          <p>
            可配置数据源、空间区域、时间范围、气象变量与目标分辨率。推荐方法默认解析为确定性输出。
          </p>
          {capabilities.allowsAdvanced ? (
            <div className="space-y-2 text-muted-foreground">
              <p>
                可使用研究高级参数：推荐方法开启不确定性量化时请求概率输出；显式确定性方法不能同时请求不确定性量化。
              </p>
              <p>
                模型集成表示概率集合成员，不代表训练多个真实模型。成员数为 5 / 10 / 20，默认
                10；确定性输出不能携带集合设置。
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">
              仅使用推荐方法，不可覆盖研究专属方法或高级参数；直接提交越权配置也会被拒绝。
            </p>
          )}
          <p className="text-muted-foreground">
            上述能力与服务器准入共用规则，不限制查看后续提供的预置概率案例。
          </p>
        </section>
      </CardContent>
      <CardFooter className="flex-wrap border-t pt-6">
        <Button disabled aria-describedby="task-create-status">
          提交降尺度任务
        </Button>
        <Link to="/tasks" className={buttonVariants({ variant: 'outline' })}>
          查看任务管理
        </Link>
      </CardFooter>
    </Card>
  )
}
