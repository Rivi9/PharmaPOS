import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { app } from 'electron'
import path from 'path'

const logsDir = path.join(app.getPath('userData'), 'logs')

/**
 * Create Winston logger instance
 */
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'pharmapos' },
  transports: [
    // Error logs
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),
    // Combined logs
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    })
  ]
})

// Console output in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  )
}

/**
 * Log levels:
 * - error: 0
 * - warn: 1
 * - info: 2
 * - http: 3
 * - verbose: 4
 * - debug: 5
 * - silly: 6
 */

export function logError(message: string, error?: Error | unknown, context?: Record<string, any>): void {
  logger.error(message, {
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error,
    ...context
  })
}

export function logWarning(message: string, context?: Record<string, any>): void {
  logger.warn(message, context)
}

export function logInfo(message: string, context?: Record<string, any>): void {
  logger.info(message, context)
}

export function logDebug(message: string, context?: Record<string, any>): void {
  logger.debug(message, context)
}
