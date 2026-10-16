/**
 * Hook to get the current user's role from the demo session.
 */

import { useQuery } from '@tanstack/react-query'
import { getDemoSession } from '@/server/functions/demo-session'
import type { UserRole } from '../types/role-emphasis'

export function useUserRole() {
  return useQuery({
    queryKey: ['demo-session'],
    queryFn: async () => {
      const account = await getDemoSession()
      if (!account) {
        return null
      }
      return account.role as UserRole
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
