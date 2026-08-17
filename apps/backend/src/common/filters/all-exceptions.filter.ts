import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { ErrorCaptureService } from '../../core/observability/error-capture.service'
import { getActiveTraceContext } from '../../core/observability/trace-context'
import { sanitizeLogValue } from '../../core/observability/sanitize'

interface RequestWithContext extends Request {
  user?: {
    id?: string | number
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  constructor(private readonly errorCaptureService: ErrorCaptureService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<RequestWithContext>()

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error'

    const isNextHmrRequest =
      request?.url?.startsWith('/_next/webpack-hmr') &&
      status === HttpStatus.NOT_FOUND

    if (isNextHmrRequest) {
      response.status(status).json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        message,
      })
      return
    }

    const traceContext = getActiveTraceContext()
    const errorType = this.getErrorType(exception)
    const errorMessage = this.getErrorMessage(exception, message)
    const entityId = this.getEntityId(request.body)
    const userId = this.getUserId(request)
    const sanitizedPath = sanitizeLogValue(request.url)

    this.logger.error(
      {
        method: request.method,
        path: sanitizedPath,
        statusCode: status,
        errorType,
        errorMessage,
        stack: exception instanceof Error ? exception.stack : undefined,
        entityId,
        userId,
        ...traceContext,
      },
      `Exception Handler: Requisição falhou p/ ${sanitizedPath}`
    )

    this.errorCaptureService.captureHttpError({
      errorType,
      errorMessage,
      stackTrace: exception instanceof Error ? exception.stack : undefined,
      method: request.method,
      path: sanitizedPath,
      statusCode: status,
      entityId,
      userId,
      payload: {
        body: request.body,
        query: request.query,
        params: request.params,
      },
    })

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    })
  }

  private getErrorType(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.constructor.name
    }

    return 'UnknownException'
  }

  private getErrorMessage(exception: unknown, fallback: unknown): string {
    if (exception instanceof Error && exception.message) {
      return exception.message
    }

    if (typeof fallback === 'string') {
      return fallback
    }

    if (
      fallback &&
      typeof fallback === 'object' &&
      'message' in fallback &&
      typeof fallback.message === 'string'
    ) {
      return fallback.message
    }

    return 'Erro não identificado'
  }

  private getEntityId(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') {
      return undefined
    }

    const record = body as Record<string, unknown>
    const candidates = [
      record.CD_Pessoa,
      record.CD_Registro_Academico,
      record.matriculaId,
      record.alunoId,
      record.gatewayId,
    ]

    const found = candidates.find(
      (value) => typeof value === 'string' || typeof value === 'number',
    )

    return found === undefined ? undefined : String(found)
  }

  private getUserId(request: RequestWithContext): string | undefined {
    if (
      request.user?.id === undefined ||
      request.user?.id === null ||
      request.user.id === ''
    ) {
      return undefined
    }

    return String(request.user.id)
  }
}
