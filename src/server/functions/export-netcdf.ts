import { createServerFn } from '@tanstack/react-start'
import { exportTaskAsNetCDF } from '@/server/services/netcdf-export.server'
import { initializeAndValidateTask } from '@/server/services/shared/assessment-service-helpers'

export const exportNetCDF = createServerFn({ method: 'POST' })
  .validator((data: { taskId: string; layer: 'downscaled' }) => data)
  .handler(async ({ data }) => {
    const { taskId } = data

    // Get and validate task
    const validation = await initializeAndValidateTask(taskId)

    if (!validation.ok) {
      return new Response(JSON.stringify({ error: validation.reason }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    }

    const { task } = validation

    // Generate NetCDF export
    const result = await exportTaskAsNetCDF(task)

    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    }

    // Return binary NetCDF file
    return new Response(result.data as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-netcdf',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  })
