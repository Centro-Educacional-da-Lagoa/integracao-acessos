import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { randomUUID } from 'crypto'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    // Se a requisição não tem traceId, geramos um
    const traceId = request.headers['x-trace-id'] || randomUUID()

    // Injetamos o traceId no contexto do request para o logger capturar
    request.headers['x-trace-id'] = traceId

    // Atualiza o contexto do Pino Logger para anexar o traceId a todos os logs gerados na request
    this.logger.assign({ traceId })

    return next.handle().pipe(
      tap(() => {
        // Operações de post-processamento se necessário
      }),
    )
  }
}
