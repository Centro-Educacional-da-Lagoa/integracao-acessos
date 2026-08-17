import { trace } from '@opentelemetry/api'

export interface ActiveTraceContext {
  traceId?: string
  spanId?: string
}

export function getActiveTraceContext(): ActiveTraceContext {
  const spanContext = trace.getActiveSpan()?.spanContext()

  if (!spanContext?.traceId || !spanContext?.spanId) {
    return {}
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  }
}
