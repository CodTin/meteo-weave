import './lib/monitoring/sentry.server'

import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export default createServerEntry(wrapFetchWithSentry(handler))
