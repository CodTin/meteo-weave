import { useState, useEffect } from 'react'
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
  name: z.string().trim(),
  dataSource: z.enum(['ecmwf', 'gfs', 'fusion']),
  variable: z.enum(['temperature', 'wind', 'pressure', 'precipitation']),
  resolution: z.enum(['1km', '3km', '5km']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请输入有效日期'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请输入有效日期'),
  method: z.enum(['recommended', 'deterministic', 'probabilistic']),
  uncertaintyQuantification: z.boolean(),
  ensembleMembers: z.enum(['5', '10', '20']).optional(),
})

type TaskFormData = z.infer<typeof taskFormSchema>

const dataSourceLabels = {
  ecmwf: 'ECMWF（欧洲中期天气预报中心）',
  gfs: 'GFS（美国全球预报系统）',
  fusion: 'Fusion（多源融合，推荐）',
}

const variableLabels = {
  temperature: 'Temperature（气温）',
  wind: 'Wind（风速风向）',
  pressure: 'Pressure（海平面气压）',
  precipitation: 'Precipitation（总降水）',
}

const resolutionLabels = {
  '1km': '1km（高精度模式）',
  '3km': '3km（标准模式）',
  '5km': '5km（快速模式）',
}

export function TaskCreatePage() {
  const { account } = useRouteContext({ from: '/_workspace' })
  const capabilities = getDownscalingCapabilities(account)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmedRegion, setConfirmedRegion] = useState<BoundingBox | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [userEditedName, setUserEditedName] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: '',
      dataSource: 'fusion',
      variable: 'temperature',
      resolution: '3km',
      startDate: '',
      endDate: '',
      method: 'recommended',
      uncertaintyQuantification: false,
      ensembleMembers: '10',
    },
  })

  // oxlint-disable-next-line react/incompatible-library -- watch from react-hook-form is intentionally not memoized for live updates
  const selectedMethod = watch('method')
  // oxlint-disable-next-line react/incompatible-library -- watch from react-hook-form is intentionally not memoized for live updates
  const uncertaintyQuantification = watch('uncertaintyQuantification')
  const watchedVariable = watch('variable')
  const watchedStartDate = watch('startDate')
  const watchedEndDate = watch('endDate')
  const watchedDataSource = watch('dataSource')
  const watchedResolution = watch('resolution')

  // Generate default name suggestion when parameters change, but don't overwrite user input
  useEffect(() => {
    if (userEditedName) return

    if (watchedStartDate && watchedEndDate) {
      const variableNames = {
        temperature: '气温',
        wind: '风场',
        pressure: '气压',
        precipitation: '降水',
      }
      const varName = variableNames[watchedVariable]

      if (watchedStartDate === watchedEndDate) {
        setValue('name', `${varName} · ${watchedStartDate}`, { shouldValidate: false })
      } else if (confirmedRegion) {
        setValue(
          'name',
          `${varName} · ${confirmedRegion.west}-${confirmedRegion.east}E, ${confirmedRegion.south}-${confirmedRegion.north}N`,
          { shouldValidate: false },
        )
      }
    }
  }, [watchedVariable, watchedStartDate, watchedEndDate, confirmedRegion, userEditedName, setValue])

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

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserEditedName(e.target.value.trim().length > 0)
  }

  const onSubmit = async (data: TaskFormData) => {
    if (!confirmedRegion) {
      setSubmitError('请先确认空间区域')
      return
    }

    // Validate date range
    if (data.startDate > data.endDate) {
      setSubmitError('开始日期不能晚于结束日期')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const taskService = createTaskService({ queryClient })
      await taskService.initialize()

      // Build configuration based on method and advanced settings
      const config: any = {
        name: data.name.trim() || undefined,
        dataSource: data.dataSource,
        variable: data.variable,
        region: confirmedRegion,
        timeRange: {
          mode: 'historical',
          start: data.startDate,
          end: data.endDate,
        },
        resolution: data.resolution,
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

  const dayCount =
    watchedStartDate && watchedEndDate
      ? Math.floor(
          (new Date(watchedEndDate).getTime() - new Date(watchedStartDate).getTime()) /
            (24 * 60 * 60 * 1000),
        ) + 1
      : 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>创建降尺度任务</CardTitle>
          <CardDescription>
            配置历史气象数据降尺度任务 · 支持多数据源、四类变量、三档分辨率
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" id="task-form">
            <FormField
              id="task-name"
              label="任务名称"
              help="为任务指定一个易于识别的名称，留空将自动生成"
              error={errors.name?.message}
            >
              <Input
                id="task-name"
                {...register('name')}
                onChange={(e) => {
                  register('name').onChange(e)
                  handleNameChange(e)
                }}
                placeholder="例如：2024年6月气温分析（可留空自动生成）"
                aria-describedby="task-name-help"
                aria-invalid={!!errors.name}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                id="data-source"
                label="数据源"
                help="选择气象数据来源"
                error={errors.dataSource?.message}
              >
                <select
                  id="data-source"
                  {...register('dataSource')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-describedby="data-source-help"
                  aria-invalid={!!errors.dataSource}
                >
                  {Object.entries(dataSourceLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                id="variable"
                label="气象变量"
                help="选择降尺度的目标变量"
                error={errors.variable?.message}
              >
                <select
                  id="variable"
                  {...register('variable')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-describedby="variable-help"
                  aria-invalid={!!errors.variable}
                >
                  {Object.entries(variableLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                id="resolution"
                label="目标分辨率"
                help="选择降尺度输出分辨率"
                error={errors.resolution?.message}
              >
                <select
                  id="resolution"
                  {...register('resolution')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-describedby="resolution-help"
                  aria-invalid={!!errors.resolution}
                >
                  {Object.entries(resolutionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="start-date"
                label="开始日期"
                help="选择历史数据起始日期（2020-01-01 至 2024-12-31）"
                error={errors.startDate?.message}
              >
                <Input
                  id="start-date"
                  type="date"
                  min="2020-01-01"
                  max="2024-12-31"
                  {...register('startDate')}
                  aria-describedby="start-date-help"
                  aria-invalid={!!errors.startDate}
                />
              </FormField>

              <FormField
                id="end-date"
                label="结束日期"
                help="选择历史数据结束日期（包含当天）"
                error={errors.endDate?.message}
              >
                <Input
                  id="end-date"
                  type="date"
                  min="2020-01-01"
                  max="2024-12-31"
                  {...register('endDate')}
                  aria-describedby="end-date-help"
                  aria-invalid={!!errors.endDate}
                />
              </FormField>
            </div>

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

            <div className="rounded-md border p-4">
              <h3 className="mb-3 font-medium">参数摘要</h3>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-muted-foreground">数据源</dt>
                  <dd>{dataSourceLabels[watchedDataSource]}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">气象变量</dt>
                  <dd>{variableLabels[watchedVariable]}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">目标分辨率</dt>
                  <dd>{resolutionLabels[watchedResolution]}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">降尺度方法</dt>
                  <dd>
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
                    <dt className="font-medium text-muted-foreground">集合成员数</dt>
                    <dd>{watch('ensembleMembers')} 个</dd>
                  </div>
                )}
                <div>
                  <dt className="font-medium text-muted-foreground">时区</dt>
                  <dd>Asia/Shanghai (UTC+8)</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">时间模式</dt>
                  <dd>历史模式（Historical）</dd>
                </div>
                {watchedStartDate && watchedEndDate && (
                  <>
                    <div className="sm:col-span-2">
                      <dt className="font-medium text-muted-foreground">时间范围</dt>
                      <dd>
                        {watchedStartDate} 至 {watchedEndDate}{' '}
                        {watchedStartDate === watchedEndDate ? '（单日）' : `（${dayCount}天）`}
                        <span className="ml-2 text-xs text-muted-foreground">
                          显示结束日期包含当天；保存范围为半开区间 [start, nextDay) UTC
                        </span>
                      </dd>
                    </div>
                  </>
                )}
                {confirmedRegion && (
                  <div className="sm:col-span-2">
                    <dt className="font-medium text-muted-foreground">空间区域</dt>
                    <dd>
                      {confirmedRegion.west.toFixed(2)}°E - {confirmedRegion.east.toFixed(2)}°E,{' '}
                      {confirmedRegion.south.toFixed(2)}°N - {confirmedRegion.north.toFixed(2)}°N
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {submitError && (
              <div
                className="rounded-md bg-destructive/10 p-4 text-sm text-destructive"
                role="alert"
              >
                {submitError}
              </div>
            )}

            <CardFooter className="flex flex-col items-start gap-2 px-0 sm:flex-row sm:items-center">
              <Button type="submit" disabled={isSubmitting || !confirmedRegion} form="task-form">
                {isSubmitting ? '提交中...' : '提交降尺度任务'}
              </Button>
              <span className="text-sm text-muted-foreground">
                预计耗时：约 2-3 秒（演示模拟，非真实计算时间）
              </span>
            </CardFooter>
          </form>
        </CardContent>
      </Card>

      <SpatialRegionSelector onRegionConfirmed={handleRegionConfirmed} />

      <Card>
        <CardHeader>
          <CardTitle>{account.roleLabel} · 配置能力</CardTitle>
        </CardHeader>
        <CardContent>
          <section aria-label="当前角色的配置能力" className="space-y-4 text-sm leading-6">
            <p>
              所有角色均可配置：ECMWF / GFS / Fusion 数据源、Temperature / Wind / Pressure /
              Precipitation 变量、1km / 3km / 5km 分辨率、历史模式 2020-01-01 至 2024-12-31
              日期范围。
            </p>

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
