import { useState } from 'react'
import { useNavigate, useRouteContext } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getDownscalingCapabilities, type DownscalingMethod } from './capabilities'
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
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { SpatialRegionSelector } from '@/features/spatial-region/spatial-region-selector'
import type { BoundingBox } from '@/features/spatial-region/validation'
import { createTaskService } from './service'
import { useQueryClient } from '@tanstack/react-query'

const taskFormSchema = z.object({
  name: z.string().trim().min(1, '任务名称不能为空'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请输入有效日期'),
  method: z.enum(['recommended', 'deterministic', 'probabilistic']),
  uncertaintyQuantification: z.boolean(),
  ensembleMembers: z.enum(['5', '10', '20']).optional(),
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
    watch,
    setValue,
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: '',
      date: '',
      method: 'recommended',
      uncertaintyQuantification: false,
      ensembleMembers: '10',
    },
  })

  // oxlint-disable-next-line react/incompatible-library -- watch from react-hook-form is intentionally not memoized for live updates
  const selectedMethod = watch('method')
  // oxlint-disable-next-line react/incompatible-library -- watch from react-hook-form is intentionally not memoized for live updates
  const uncertaintyQuantification = watch('uncertaintyQuantification')

  const handleRegionConfirmed = (bbox: BoundingBox) => {
    setConfirmedRegion(bbox)
  }

  const handleMethodChange = (method: DownscalingMethod) => {
    setValue('method', method)
    // Clear incompatible settings when switching methods
    if (method === 'deterministic') {
      setValue('uncertaintyQuantification', false)
      setValue('ensembleMembers', '10')
    }
  }

  const handleUncertaintyChange = (checked: boolean | 'indeterminate') => {
    const isChecked = checked === true
    setValue('uncertaintyQuantification', isChecked)
    if (!isChecked && selectedMethod === 'recommended') {
      // When disabling uncertainty on recommended, clear ensemble members
      setValue('ensembleMembers', '10')
    }
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

      // Build configuration based on method and advanced settings
      const config: any = {
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
        method: data.method,
      }

      // Add advanced parameters if applicable
      if (
        capabilities.allowsAdvanced &&
        (data.method === 'probabilistic' ||
          (data.method === 'recommended' && data.uncertaintyQuantification))
      ) {
        config.advanced = {
          uncertaintyQuantification: data.uncertaintyQuantification,
          ensembleMembers: data.ensembleMembers ? Number(data.ensembleMembers) : undefined,
        }
      }

      const result = await taskService.create(config)

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

            {capabilities.allowsAdvanced && (
              <FormField
                id="task-method"
                label="降尺度方法"
                help="选择降尺度计算方法。推荐方法由系统智能选择；确定性方法速度快结果稳定；概率式方法表达不确定性。"
              >
                <RadioGroup value={selectedMethod} onValueChange={handleMethodChange}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="recommended" id="method-recommended" />
                    <Label htmlFor="method-recommended">推荐方法</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="deterministic" id="method-deterministic" />
                    <Label htmlFor="method-deterministic">确定性方法</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="probabilistic" id="method-probabilistic" />
                    <Label htmlFor="method-probabilistic">概率式方法</Label>
                  </div>
                </RadioGroup>
              </FormField>
            )}

            {capabilities.allowsAdvanced &&
              (selectedMethod === 'probabilistic' || selectedMethod === 'recommended') && (
                <div className="space-y-4 rounded-md border p-4">
                  <h3 className="font-medium text-sm">高级参数</h3>

                  {selectedMethod === 'recommended' && (
                    <div className="flex items-start space-x-2">
                      <Checkbox
                        id="uncertainty-quantification"
                        checked={uncertaintyQuantification}
                        onCheckedChange={handleUncertaintyChange}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label
                          htmlFor="uncertainty-quantification"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          启用不确定性量化
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          开启后推荐方法将解析为概率式输出，提供不确定性信息
                        </p>
                      </div>
                    </div>
                  )}

                  {(selectedMethod === 'probabilistic' ||
                    (selectedMethod === 'recommended' && uncertaintyQuantification)) && (
                    <FormField
                      id="ensemble-members"
                      label="概率集合成员数"
                      help="模型集成的概率集合成员数量。更多成员提供更丰富的不确定性表达。"
                    >
                      <RadioGroup
                        value={watch('ensembleMembers')}
                        onValueChange={(value) => setValue('ensembleMembers', value as any)}
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="5" id="members-5" />
                          <Label htmlFor="members-5">5 个成员</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="10" id="members-10" />
                          <Label htmlFor="members-10">10 个成员（默认）</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="20" id="members-20" />
                          <Label htmlFor="members-20">20 个成员</Label>
                        </div>
                      </RadioGroup>
                    </FormField>
                  )}
                </div>
              )}

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
                  <dd className="inline">
                    {selectedMethod === 'recommended' && '推荐方法'}
                    {selectedMethod === 'deterministic' && '确定性方法'}
                    {selectedMethod === 'probabilistic' && '概率式方法'}
                    {selectedMethod === 'recommended' &&
                      uncertaintyQuantification &&
                      ' (启用不确定性量化)'}
                  </dd>
                </div>
                {(selectedMethod === 'probabilistic' ||
                  (selectedMethod === 'recommended' && uncertaintyQuantification)) && (
                  <div>
                    <dt className="inline">集合成员数：</dt>
                    <dd className="inline">{watch('ensembleMembers')} 个</dd>
                  </div>
                )}
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
          <section aria-label="当前角色的配置能力" className="space-y-4 text-sm leading-6">
            <div>
              <h3 className="font-medium mb-2">可用降尺度方法</h3>
              <ul className="list-disc list-inside space-y-1" aria-label="可用降尺度方法">
                {capabilities.methods.includes('recommended') && <li>推荐方法</li>}
                {capabilities.methods.includes('deterministic') && <li>确定性方法</li>}
                {capabilities.methods.includes('probabilistic') && <li>概率式方法</li>}
              </ul>
            </div>

            {capabilities.allowsAdvanced ? (
              <div className="space-y-2 text-muted-foreground">
                <p>研究人员可使用所有方法和高级参数：</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>推荐方法可开启不确定性量化以获得概率输出</li>
                  <li>概率式方法支持 5/10/20 个集合成员配置</li>
                  <li>确定性方法不支持不确定性量化或集合参数</li>
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">
                当前角色固定使用推荐方法，不可覆盖研究专属方法或高级参数。直接提交越权配置会被服务器拒绝。
              </p>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
