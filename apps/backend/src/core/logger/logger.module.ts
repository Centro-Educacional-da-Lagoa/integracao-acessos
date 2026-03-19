import { Module } from '@nestjs/common'
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino'
import { randomUUID } from 'crypto'

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        genReqId: (req) => {
          return req.headers['x-trace-id'] || randomUUID()
        },
        transport:
          process.env.NODE_ENV !== 'production'
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
