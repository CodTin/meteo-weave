import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from '@sentry/tanstackstart-react'
import { createStart } from '@tanstack/react-start'

export const startInstance = createStart(() => ({
  defaultSsr: true,
  requestMiddleware: [sentryGlobalRequestMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}))
