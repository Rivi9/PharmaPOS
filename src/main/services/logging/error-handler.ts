import * as Sentry from '@sentry/electron/main'
import { app, dialog } from 'electron'
import { logError } from './logger'

let isInitialized = false

/**
 * Initialize Sentry error tracking
 */
export function initializeErrorTracking(): void {
  if (isInitialized) return

  // Only initialize Sentry in production
  if (process.env.NODE_ENV === 'production') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN, // Set in environment or build config
      environment: process.env.NODE_ENV,
      release: app.getVersion(),
      beforeSend(event) {
        // Don't send events if user hasn't opted in to error reporting
        // This should be checked against settings
        return event
      }
    })
  }

  isInitialized = true
}

/**
 * Handle uncaught exceptions
 */
export function setupGlobalErrorHandlers(): void {
  // Main process errors
  process.on('uncaughtException', (error) => {
    logError('Uncaught Exception', error, { fatal: true })

    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error)
    }

    // Show error dialog
    dialog.showErrorBox(
      'Application Error',
      `An unexpected error occurred:\n\n${error.message}\n\nThe application will continue running, but some features may not work correctly.`
    )
  })

  process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled Promise Rejection', reason as Error, { promise: String(promise) })

    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(reason)
    }
  })
}

/**
 * Report error to tracking service
 */
export function reportError(error: Error, context?: Record<string, any>): void {
  logError('Reported Error', error, context)

  if (process.env.NODE_ENV === 'production') {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext('additional', context)
      }
      Sentry.captureException(error)
    })
  }
}

/**
 * Set user context for error tracking
 */
export function setErrorTrackingUser(user: { id: string; username: string }): void {
  if (process.env.NODE_ENV === 'production') {
    Sentry.setUser({
      id: user.id,
      username: user.username
    })
  }
}

/**
 * Clear user context
 */
export function clearErrorTrackingUser(): void {
  if (process.env.NODE_ENV === 'production') {
    Sentry.setUser(null)
  }
}
