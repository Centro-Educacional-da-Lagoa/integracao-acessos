import { Module } from '@nestjs/common'
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino'
import { randomUUID } from 'crypto'
import pino from 'pino'
import { getActiveTraceContext } from '../observability/trace-context'
import { sanitizeForLog, sanitizeLogValue } from '../observability/sanitize'

const serviceName = process.env.SERVICE_NAME || 'integracao-acessos-backend'
const isProduction = process.env.NODE_ENV === 'production'
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')
const prettyLogs = process.env.LOG_PRETTY === 'true' && !isProduction

function getRequestUrl(req: { url?: string; originalUrl?: string }) {
  return sanitizeLogValue(req.originalUrl || req.url)
}

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      assignResponse: true,
      pinoHttp: {
        level: logLevel,
        base: undefined,
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          level: (label) => ({ level: label }),
        },
        hooks: {
          logMethod(inputArgs, method) {
            const sanitizedArgs = inputArgs.map((arg) => sanitizeForLog(arg))
            return method.apply(
              this,
              sanitizedArgs as [string, ...unknown[]],
            )
          },
        },
        mixin: () => ({
          service: serviceName,
          ...getActiveTraceContext(),
        }),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'headers.authorization',
            'headers.cookie',
            'headers["x-api-key"]',
            '*.password',
            '*.senha',
            '*.token',
          ],
          remove: true,
        },
        autoLogging: {
          ignore: (req) => !!req.url && req.url.startsWith('/_next/webpack-hmr'),
        },
        genReqId: (req) => {
          return req.headers['x-trace-id'] || randomUUID()
        },
        customLogLevel: (_req, res, error) => {
          if (error || res.statusCode >= 500) return 'error'
          if (res.statusCode >= 400) return 'warn'
          return 'info'
        },
        customReceivedMessage: () => 'HTTP request received',
        customSuccessMessage: () => 'HTTP request completed',
        customErrorMessage: () => 'HTTP request failed',
        customReceivedObject: (req) => ({
          context: 'HTTP',
          method: req.method,
          url: getRequestUrl(req),
          userAgent: req.headers['user-agent'],
        }),
        customSuccessObject: (req, res, val) => ({
          context: 'HTTP',
          method: req.method,
          url: getRequestUrl(req),
          statusCode: res.statusCode,
          responseTimeMs: val?.responseTime,
        }),
        customErrorObject: (req, res, error, val) => ({
          context: 'HTTP',
          method: req.method,
          url: getRequestUrl(req),
          statusCode: res.statusCode,
          responseTimeMs: val?.responseTime,
          err: {
            message: error.message,
            stack: error.stack,
          },
        }),
        transport:
          prettyLogs
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  colorize: true,
                },
              }
            : undefined,
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class AppLoggerModule {}
