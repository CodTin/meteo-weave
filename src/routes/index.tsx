import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, CheckCircle2, Layers, LockKeyhole, Route as RouteIcon } from 'lucide-react'
import { EntryShell } from '@/components/entry/entry-shell'
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

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: '平台入口 · MeteoWeave' },
      {
        name: 'description',
        content: 'MeteoWeave 气象降尺度演示平台：了解分析流程，前往登录入口。认证与计算尚未接入。',
      },
    ],
  }),
  component: EntryPage,
})

function EntryPage() {
  return (
    <EntryShell>
      <div className="mb-8">
        <p className="mb-3 flex items-center gap-2 text-xs font-medium tracking-widest text-muted-foreground">
          <Layers className="size-4" aria-hidden="true" /> 平台入口{' '}
          <span aria-hidden="true">/</span> <span className="font-mono">WORKSPACE</span>
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          气象降尺度工作台
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
          从原始预报到局地细节，了解气象数据的降尺度与分析流程。
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-medium tracking-widest text-muted-foreground">
                开始使用
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs text-success">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                入口已就绪
              </span>
            </div>
            <CardTitle className="text-2xl">探索精细化气象分析</CardTitle>
            <CardDescription>
              从登录入口了解演示方式。当前仅开放界面预览，不会创建会话或执行计算。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResolutionPreview />
          </CardContent>
          <CardFooter className="flex-col items-stretch sm:flex-row sm:items-center">
            <Link to="/login" className={buttonVariants({ size: 'lg' })}>
              前往登录 <ArrowRight aria-hidden="true" />
            </Link>
            <a href="#demo-scope" className={buttonVariants({ variant: 'ghost' })}>
              了解演示范围
            </a>
          </CardFooter>
        </Card>
        <Card id="demo-scope" className="scroll-mt-6">
          <CardHeader>
            <span className="mb-2 text-xs font-medium tracking-widest text-muted-foreground">
              当前环境
            </span>
            <CardTitle>演示范围</CardTitle>
            <CardDescription>先熟悉工作流程，再开始分析。</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <div className="flex items-center justify-between gap-3 pb-4">
                <dt>产品入口</dt>
                <dd className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  可访问
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-4">
                <dt>身份认证</dt>
                <dd className="text-muted-foreground">尚未接入</dd>
              </div>
              <div className="flex items-center justify-between gap-3 pt-4">
                <dt>降尺度计算</dt>
                <dd className="text-muted-foreground">尚未开放</dd>
              </div>
            </dl>
            <div className="mt-6 flex items-start gap-3 rounded-lg border bg-background p-4">
              <LockKeyhole
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-xs leading-6 text-muted-foreground">
                认证尚未接入。当前无需提交账号或任何个人信息，页面中的分辨率仅用于说明流程。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="workflow-title" className="mt-8 border-t pt-6">
        <h2 id="workflow-title" className="flex items-center gap-2 text-sm font-medium">
          <RouteIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          后续分析流程{' '}
          <span className="ml-auto text-xs font-normal text-muted-foreground">功能建设中</span>
        </h2>
        <ol className="mt-5 grid gap-5 sm:grid-cols-3">
          {[
            ['01', '配置降尺度任务', '选择数据源、空间区域与目标分辨率'],
            ['02', '对比精细化结果', '对照原始数据、降尺度数据与观测数据'],
            ['03', '评估与导出', '查看精度指标，整理分析结果'],
          ].map(([step, title, description]) => (
            <li key={step} className="flex gap-3">
              <span className="pt-0.5 font-mono text-xs text-muted-foreground">{step}</span>
              <div>
                <h3 className="text-sm">{title}</h3>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </EntryShell>
  )
}
