import { useState } from 'react'
import type { DownscalingTask } from '../service'

export type TaskComparisonControl = {
  selected: boolean
  disabled: boolean
  onToggle: () => void
}

export function useComparisonSelection(
  tasks: DownscalingTask[],
  ownerId: DownscalingTask['ownerId'],
) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const availableTasks = tasks.filter(
    (task) => task.ownerId === ownerId && task.status === 'Completed',
  )
  const selectedTasks = selectedIds.flatMap((id) => {
    const task = availableTasks.find((candidate) => candidate.id === id)
    return task ? [task] : []
  })

  const controlFor = (task: DownscalingTask): TaskComparisonControl => ({
    selected: selectedTasks.some((selected) => selected.id === task.id),
    disabled: !availableTasks.some((available) => available.id === task.id),
    onToggle: () => {
      setSelectionError(null)
      const currentIds = selectedTasks.map((selected) => selected.id)
      if (currentIds.includes(task.id)) {
        setSelectedIds(currentIds.filter((id) => id !== task.id))
      } else if (availableTasks.some((available) => available.id === task.id)) {
        if (currentIds.length === 2) {
          setSelectionError('最多选择两个任务，请先取消一个已选任务后再选择。')
        } else {
          setSelectedIds([...currentIds, task.id])
        }
      }
    },
  })

  const [first, second] = selectedTasks
  const comparisonHref =
    first && second
      ? `/tasks/compare?a=${encodeURIComponent(first.id)}&b=${encodeURIComponent(second.id)}`
      : null

  const removeTask = (id: string) => {
    setSelectedIds(selectedTasks.filter((task) => task.id !== id).map((task) => task.id))
    setSelectionError(null)
  }

  const clearSelection = () => {
    setSelectedIds([])
    setSelectionError(null)
  }

  return { selectedTasks, selectionError, controlFor, comparisonHref, removeTask, clearSelection }
}
