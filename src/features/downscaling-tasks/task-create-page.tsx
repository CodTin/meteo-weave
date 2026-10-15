import { useState } from 'react'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getDownscalingCapabilities } from './capabilities'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { SpatialRegionSelector } from '@/features/spatial-region/spatial-region-selector'
import type { BoundingBox } from '@/features/spatial-region/validation'
import { createTaskService } from './service'
import { useQueryClient } from '@tanstack/react-query'

const taskFormSchema = z.object({
  name: z.string().trim().min(1, '任务名称不能为空'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请输入有效日期'),
})

type TaskFormData = z.infer<typeof taskFormSchema>

export function TaskCreatePage() {
  const { account } = useRouteContext({ from: '/_workspace' })
  const capabilities = getDownscalingCapabilities(account)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmedRegion, setConfirmedRegion] = useState<BoundingBox | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: '',
      date: '',
    },
  })

  const handleRegionConfirmed = (bbox: BoundingBox) => {
    setConfirmedRegion(bbox)
  }

  const onSubmit = async (data: TaskFormData) => {
    if (!confirmedRegion) {
      setSubmitError('请先确认空间区域')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const taskService = createTaskService({ queryClient })
      await taskService.initialize()

      const result = await taskService.create({
        name: data.name,
        dataSource: 'fusion',
        variable: 'temperature',
        region: confirmedRegion,
        timeRange: {
          mode: 'historical',
          start: data.date,
          end: data.date,
        },
        resolution: '3km',
        method: 'recommended',
      })

      if (!result.ok) {
        setSubmitError(result.error)
        return
      }

      // Navigate to result page
      await navigate({ to: `/tasks/${result.task.id}` })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '提交失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>创建降尺度任务</CardTitle>
          <CardDescription>
            配置单日历史气温任务 · Fusion 数据源 · 3km 分辨率 · 推荐方法
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              id="task-name"
              label="任务名称"
              help="为任务指定一个易于识别的名称"
              error={errors.name?.message}
            >
              <Input
                id="task-name"
                {...register('name')}
                placeholder="例如：2024年6月气温分析"
                aria-describedby="task-name-help"
                aria-invalid={!!errors.name}
              />
            </FormField>

            <FormField
              id="task-date"
              label="日期"
              help="选择历史日期（2020-01-01 至 2024-12-31），时区：Asia/Shanghai"
              error={errors.date?.message}
            >
              <Input
                id="task-date"
                type="date"
                min="2020-01-01"
                max="2024-12-31"
                {...register('date')}
                aria-describedby="task-date-help"
                aria-invalid={!!errors.date}
              />
            </FormField>

            <div className="rounded-md border p-4 text-sm">
              <h3 className="mb-2 font-medium">当前配置</h3>
              <dl className="space-y-1 text-muted-foreground">
                <div>
                  <dt className="inline">数据源：</dt>
                  <dd className="inline">Fusion（融合）</dd>
                </div>
                <div>
                  <dt className="inline">气象变量：</dt>
                  <dd className="inline">Temperature（气温）</dd>
                </div>
                <div>
                  <dt className="inline">目标分辨率：</dt>
                  <dd className="inline">3km</dd>
                </div>
                <div>
                  <dt className="inline">降尺度方法：</dt>
                  <dd className="inline">推荐方法（Recommended）</dd>
                </div>
                <div>
                  <dt className="inline">时区：</dt>
                  <dd className="inline">Asia/Shanghai (UTC+8)</dd>
                </div>
                {confirmedRegion && (
                  <>
                    <div>
                      <dt className="inline">时间范围：</dt>
                      <dd className="inline">
                        {getValues('date') || '未选择'} 00:00 至次日 00:00（半开区间）
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">空间区域：</dt>
                      <dd className="inline">
                        {confirmedRegion.west}°E - {confirmedRegion.east}°E, {confirmedRegion.south}
                        °N - {confirmedRegion.north}°N
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            {submitError && (
              <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <CardFooter className="flex gap-4 px-0">
              <Button type="submit" disabled={isSubmitting || !confirmedRegion}>
                {isSubmitting ? '提交中...' : '提交降尺度任务'}
              </Button>
              <span className="text-sm text-muted-foreground">
                预计耗时：约 2-3 秒（Synthetic Demo 模拟）
              </span>
            </CardFooter>
          </form>
        </CardContent>
      </Card>

      <SpatialRegionSelector onRegionConfirmed={handleRegionConfirmed} />

      <Card className="gap-4 py-4">
        <CardHeader>
          <CardTitle>{account.roleLabel} · 配置能力</CardTitle>
        </CardHeader>
        <CardContent>
          <section aria-label="当前角色的配置能力" className="space-y-2 text-sm leading-6">
            <p>
              当前固定配置：Fusion 数据源、Temperature 变量、3km
              分辨率、推荐方法。后续版本将支持更多配置选项。
            </p>
            {capabilities.allowsAdvanced ? (
              <div className="space-y-2 text-muted-foreground">
                <p>
                  研究人员可在后续版本使用高级参数：推荐方法开启不确定性量化时请求概率输出；显式确定性方法不能同时请求不确定性量化。
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                仅使用推荐方法，不可覆盖研究专属方法或高级参数；直接提交越权配置也会被拒绝。
              </p>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
