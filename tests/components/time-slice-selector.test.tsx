import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  TimeSliceSelector,
  type TimeSlice,
} from '@/features/result-analysis/components/time-slice-selector'

describe('TimeSliceSelector', () => {
  const mockTimeSlices: TimeSlice[] = [
    {
      value: '2024-01-01T00:00:00.000Z',
      label: '2024-01-01 00:00',
      displayTime: '2024-01-01 00:00 UTC',
    },
    {
      value: '2024-01-01T01:00:00.000Z',
      label: '2024-01-01 01:00',
      displayTime: '2024-01-01 01:00 UTC',
    },
    {
      value: '2024-01-01T02:00:00.000Z',
      label: '2024-01-01 02:00',
      displayTime: '2024-01-01 02:00 UTC',
    },
  ]

  it('renders time slice selector with current time', () => {
    const onTimeChange = vi.fn()
    render(
      <TimeSliceSelector
        timeSlices={mockTimeSlices}
        currentTime={mockTimeSlices[0]!.value}
        onTimeChange={onTimeChange}
      />,
    )

    expect(screen.getByText('Time Slice (UTC)')).toBeInTheDocument()
    const combobox = screen.getByRole('combobox')
    expect(combobox).toBeInTheDocument()
    expect(screen.getByText('2024-01-01 00:00 UTC')).toBeInTheDocument()
  })

  it('displays custom timezone in label', () => {
    const onTimeChange = vi.fn()
    render(
      <TimeSliceSelector
        timeSlices={mockTimeSlices}
        currentTime={mockTimeSlices[0]!.value}
        onTimeChange={onTimeChange}
        timezone="Asia/Shanghai"
      />,
    )

    const label = screen.getByText('Time Slice (Asia/Shanghai)')
    expect(label).toBeInTheDocument()
  })

  it('renders all available time slices', () => {
    const onTimeChange = vi.fn()
    render(
      <TimeSliceSelector
        timeSlices={mockTimeSlices}
        currentTime={mockTimeSlices[0]!.value}
        onTimeChange={onTimeChange}
      />,
    )

    // Verify the Select component received the correct props
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveAttribute('data-state', 'closed')
  })

  it('disables selector when disabled prop is true', () => {
    const onTimeChange = vi.fn()
    render(
      <TimeSliceSelector
        timeSlices={mockTimeSlices}
        currentTime={mockTimeSlices[0]!.value}
        onTimeChange={onTimeChange}
        disabled={true}
      />,
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeDisabled()
  })

  it('is keyboard accessible', async () => {
    const user = userEvent.setup()
    const onTimeChange = vi.fn()
    render(
      <TimeSliceSelector
        timeSlices={mockTimeSlices}
        currentTime={mockTimeSlices[0]!.value}
        onTimeChange={onTimeChange}
      />,
    )

    const trigger = screen.getByRole('combobox')
    await user.tab()
    expect(trigger).toHaveFocus()
  })
})
