import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { getActiveTraceContext } from './trace-context'

interface CaptureHttpErrorInput {
  errorType: string
  errorMessage: string
  stackTrace?: string
  method?: string
  path?: string
  statusCode: number
  entityId?: string
  userId?: string
  payload?: unknown
}

interface ErrorCapturePayload {
  service: string
  environment: string
  error_type: string
  error_message: string
  stack_trace?: string
  trace_id?: string
  span_id?: string
  http_method?: string
  http_path?: string
  http_status: number
  entity_id?: string
  user_id?: string
  payload?: unknown
}

@Injectable()
export class ErrorCaptureService {
  private readonly serviceName =
    process.env.SERVICE_NAME || 'integracao-acessos-backend'
  private readonly environment = process.env.NODE_ENV || 'development'
  private readonly timeoutMs = 2000

  captureHttpError(input: CaptureHttpErrorInput): void {
    const url = process.env.ERROR_CAPTURE_URL
    const key = process.env.ERROR_CAPTURE_KEY

    if (!url || !key) {
      return
    }

    const traceContext = getActiveTraceContext()
    const payload: ErrorCapturePayload = {
      service: this.serviceName,
      environment: this.environment,
      error_type: input.errorType,
      error_message: input.errorMessage,
      stack_trace: input.stackTrace,
      trace_id: traceContext.traceId,
      span_id: traceContext.spanId,
      http_method: input.method,
      http_path: input.path,
      http_status: input.statusCode,
      entity_id: input.entityId,
      user_id: input.userId,
      payload: input.payload,
    }

    setImmediate(() => {
      void this.postError(url, key, payload)
    })
  }

  private async postError(
    baseUrl: string,
    key: string,
    payload: ErrorCapturePayload,
  ): Promise<void> {
    try {
      await axios.post(`${baseUrl.replace(/\/+$/, '')}/errors`, payload, {
        headers: {
          'X-Error-Capture-Key': key,
        },
        timeout: this.timeoutMs,
        validateStatus: () => true,
      })
    } catch {
      // Best-effort: falha de observabilidade não pode afetar o fluxo funcional.
    }
  }
}
