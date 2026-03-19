import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { Logger } from 'nestjs-pino'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  
  app.useGlobalFilters(new AllExceptionsFilter())

  await app.listen(3000)
}
bootstrap()
