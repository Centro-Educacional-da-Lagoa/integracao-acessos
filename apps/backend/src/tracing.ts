import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { resourceFromAttributes } from '@opentelemetry/resources'

const serviceName = process.env.SERVICE_NAME || 'integracao-acessos-backend'
const environment = process.env.NODE_ENV || 'development'
const serviceVersion = process.env.npm_package_version || '0.0.1'

let sdk: NodeSDK | null = null
let shutdownRegistered = false

function writeBootstrapLog(level: 'info' | 'warn' | 'error', msg: string) {
  process.stdout.write(
    `${JSON.stringify({
      level,
      time: new Date().toISOString(),
      msg,
      service: serviceName,
      context: 'OpenTelemetry',
    })}\n`,
  )
}

function getOtlpTraceEndpoint(): string {
  const configured =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    'http://10.39.112.3:4318'

  return configured.endsWith('/v1/traces')
    ? configured
    : `${configured.replace(/\/+$/, '')}/v1/traces`
}

function startTracing() {
  if (process.env.OTEL_ENABLED === 'false') {
    writeBootstrapLog('info', 'OpenTelemetry desabilitado por OTEL_ENABLED=false')
    return
  }

  try {
    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        'service.name': serviceName,
        'service.version': serviceVersion,
        'deployment.environment': environment,
      }),
      traceExporter: new OTLPTraceExporter({
        url: getOtlpTraceEndpoint(),
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    })

    sdk.start()
    writeBootstrapLog('info', 'OpenTelemetry inicializado')
  } catch {
    sdk = null
    writeBootstrapLog(
      'warn',
      'OpenTelemetry não inicializado; aplicação seguirá sem exportar traces',
    )
  }
}

export async function shutdownTracing(): Promise<void> {
  if (!sdk) return

  try {
    await Promise.race([
      sdk.shutdown(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 2000)
      }),
    ])
  } catch {
    writeBootstrapLog(
      'warn',
      'Falha ao finalizar OpenTelemetry; encerramento continuará',
    )
  }
}

startTracing()

if (!shutdownRegistered) {
  shutdownRegistered = true
  process.once('SIGTERM', () => {
    void shutdownTracing()
  })
}
