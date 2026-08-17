import './tracing'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { Logger } from 'nestjs-pino'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { ErrorCaptureService } from './core/observability/error-capture.service'
import { shutdownTracing } from './tracing'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.enableShutdownHooks()
  app.useLogger(app.get(Logger))

  app.useGlobalFilters(new AllExceptionsFilter(app.get(ErrorCaptureService)))

  await app.listen(3000)
}
bootstrap().catch((error) => {
  process.stdout.write(
    `${JSON.stringify({
      level: 'error',
      time: new Date().toISOString(),
      msg: 'Falha ao inicializar aplicação NestJS',
      service: process.env.SERVICE_NAME || 'integracao-acessos-backend',
      context: 'Bootstrap',
      err: error instanceof Error ? error.message : 'Erro desconhecido',
      stack: error instanceof Error ? error.stack : undefined,
    })}\n`,
  )

  void shutdownTracing().finally(() => process.exit(1))
})
