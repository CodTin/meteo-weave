/**
 * Threshold configuration and probability display component.
 * Allows users to configure meteorological thresholds and view exceedance probabilities.
 */

import { useState, useMemo } from 'react'
import type { ThresholdDefinition, ThresholdVariable, ThresholdDirection } from '../types/threshold'
import { validateThreshold } from '../types/threshold'
import { evaluateThresholdProbability, evaluateImpactArea } from '../service/threshold-probability'
import type { ResultReply } from '@/features/downscaling-tasks/service/contracts'

interface ThresholdPanelProps {
  result: ResultReply | null
  isPreview?: boolean
}

export function ThresholdPanel({ result, isPreview = false }: ThresholdPanelProps) {
  const [thresholdValue, setThresholdValue] = useState<string>('25')
  const [direction, setDirection] = useState<ThresholdDirection>('greater-than')

  // Derive threshold definition from result
  const threshold: ThresholdDefinition | null = useMemo(() => {
    if (!result || !result.ok) return null

    const variable = result.variable as ThresholdVariable
    let quantity: ThresholdDefinition['quantity']
    let unit: string
    let interval: ThresholdDefinition['interval']

    if (result.variable === 'temperature') {
      quantity = 'T2M'
      unit = result.unit
      interval = result.temporalStatistic === 'daily-mean' ? 'daily' : 'instantaneous'
    } else if (result.variable === 'precipitation') {
      quantity = 'TP'
      unit = result.unit
      interval = 'accumulation'
    } else if (result.variable === 'pressure') {
      quantity = 'MSL'
      unit = result.unit
      interval = 'instantaneous'
    } else if (result.variable === 'wind') {
      quantity = 'U10/V10-speed'
      unit = result.unit
      interval = 'instantaneous'
    } else {
      return null
    }

    const value = parseFloat(thresholdValue)
    if (!Number.isFinite(value)) return null

    return { variable, quantity, value, direction, unit, interval }
  }, [result, thresholdValue, direction])

  // Validate and evaluate threshold
  const { validation, probabilities, impactArea } = useMemo(() => {
    if (!threshold || !result) {
      return { validation: null, probabilities: [], impactArea: null }
    }

    const validation = validateThreshold(threshold, result)
    if (!validation.valid) {
      return { validation, probabilities: [], impactArea: null }
    }

    const probabilities = evaluateThresholdProbability(threshold, result)
    const impactArea = evaluateImpactArea(threshold, result, isPreview)

    return { validation, probabilities, impactArea }
  }, [threshold, result, isPreview])

  if (!result || !result.ok) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-600">结果数据不可用</p>
      </div>
    )
  }

  if (!result.ensemble || result.ensemble.kind !== 'members') {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800">
          阈值概率分析需要集合成员数据。确定性任务不提供概率信息。
        </p>
      </div>
    )
  }

  const defaultThresholds = {
    temperature: { value: '25', unit: '°C', label: '高温' },
    precipitation: { value: '10', unit: 'mm', label: '强降水' },
    pressure: { value: '1013', unit: 'hPa', label: '低压' },
    wind: { value: '10', unit: 'm/s', label: '强风' },
  }

  const currentDefault = defaultThresholds[result.variable as ThresholdVariable]

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-4 text-sm font-medium text-gray-900">阈值配置</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Threshold Value */}
            <div>
              <label htmlFor="threshold-value" className="block text-sm font-medium text-gray-700">
                阈值数值
              </label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="number"
                  id="threshold-value"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(e.target.value)}
                  step="any"
                  className="block w-full rounded-l-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder={currentDefault?.value}
                />
                <span className="inline-flex items-center rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                  {currentDefault?.unit}
                </span>
              </div>
            </div>

            {/* Direction */}
            <div>
              <label
                htmlFor="threshold-direction"
                className="block text-sm font-medium text-gray-700"
              >
                比较方向
              </label>
              <select
                id="threshold-direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as ThresholdDirection)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="greater-than">严格大于 (&gt;)</option>
                <option value="less-than">严格小于 (&lt;)</option>
              </select>
            </div>
          </div>

          {/* Threshold Description */}
          {threshold && (
            <div className="rounded-md bg-gray-50 p-3">
              <p className="text-sm text-gray-700">
                <span className="font-medium">当前阈值：</span>
                {result.variable === 'temperature' && '温度'}
                {result.variable === 'precipitation' && '降水'}
                {result.variable === 'pressure' && '气压'}
                {result.variable === 'wind' && '风速'}
                {direction === 'greater-than' ? ' > ' : ' < '}
                {threshold.value} {threshold.unit}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                适用区间：
                {threshold.interval === 'instantaneous' && '瞬时值'}
                {threshold.interval === 'daily' && '日统计'}
                {threshold.interval === 'accumulation' && '累计值'}
              </p>
            </div>
          )}

          {/* Validation Error */}
          {validation && !validation.valid && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-800">{validation.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Point Probability Results */}
      {validation?.valid && probabilities.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-sm font-medium text-gray-900">点位超阈值概率</h3>

          <div className="space-y-3">
            {probabilities.slice(0, 10).map((prob, idx) => (
              <div key={idx} className="rounded-md bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">
                      ({prob.longitude.toFixed(2)}, {prob.latitude.toFixed(2)})
                    </span>
                    <span className="ml-2 text-gray-500">
                      {new Date(prob.time).toISOString().slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  <div className="text-right">
                    {prob.probability !== null ? (
                      <>
                        <span className="text-lg font-semibold text-blue-600">
                          {(prob.probability * 100).toFixed(0)}%
                        </span>
                        <p className="text-xs text-gray-500">
                          {prob.exceedingMembers}/{prob.validMembers} 成员
                        </p>
                      </>
                    ) : (
                      <span className="text-sm text-gray-400">无有效成员</span>
                    )}
                  </div>
                </div>
                {prob.unavailableMemberIds.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    缺失成员：{prob.unavailableMemberIds.join(', ')}
                  </p>
                )}
              </div>
            ))}
            {probabilities.length > 10 && (
              <p className="text-sm text-gray-500">
                显示前 10 个点位，共 {probabilities.length} 个点位
              </p>
            )}
          </div>
        </div>
      )}

      {/* Impact Area Summary */}
      {validation?.valid && impactArea && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-sm font-medium text-gray-900">气象条件影响范围</h3>

          <div className="space-y-4">
            {/* Ensemble Statistics */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-md bg-blue-50 p-3 text-center">
                <p className="text-xs text-gray-600">平均格点比例</p>
                <p className="mt-1 text-lg font-semibold text-blue-600">
                  {(impactArea.meanProportion * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-md bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-600">最小格点比例</p>
                <p className="mt-1 text-lg font-semibold text-gray-700">
                  {(impactArea.minProportion * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-md bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-600">最大格点比例</p>
                <p className="mt-1 text-lg font-semibold text-gray-700">
                  {(impactArea.maxProportion * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Per-Member Details */}
            <div>
              <h4 className="mb-2 text-xs font-medium text-gray-700">各成员格点比例</h4>
              <div className="space-y-2">
                {impactArea.members.map((member) => (
                  <div
                    key={member.memberId}
                    className="flex items-center justify-between rounded-md bg-gray-50 p-2"
                  >
                    <span className="text-sm text-gray-700">{member.memberId}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600">
                        {member.exceedingPoints}/{member.validPoints} 格点
                      </span>
                      <span className="text-sm font-medium text-blue-600">
                        {(member.proportion * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coverage Information */}
            <div className="rounded-md bg-yellow-50 p-3">
              <p className="text-xs text-yellow-800">
                <span className="font-medium">说明：</span>
                {impactArea.coverageNote}
              </p>
              <p className="mt-2 text-xs text-yellow-700">
                有效成员数：{impactArea.validMembers}，总格点数：{impactArea.totalGridPoints}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Warnings and Disclaimers */}
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
        <h3 className="mb-2 text-sm font-medium text-orange-900">重要说明</h3>
        <ul className="list-inside list-disc space-y-1 text-xs text-orange-800">
          <li>阈值为演示分析参数，不构成官方预警标准</li>
          <li>经验概率为集合成员占比，不表示已校准的气象风险发生率</li>
          <li>等于阈值的情况不满足严格大于或严格小于条件</li>
          <li>所有结果基于 Synthetic Demo 数据，非业务预报</li>
        </ul>
      </div>
    </div>
  )
}
