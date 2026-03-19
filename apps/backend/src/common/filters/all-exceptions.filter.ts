import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // O request.headers['x-trace-id'] garante que ligaremos esse erro c/ o trace gerado no interceptor/cron
    this.logger.error(
      {
        path: request.url,
        body: request.body,
        error: exception instanceof Error ? exception.message : exception,
        stack: exception instanceof Error ? exception.stack : undefined,
      },
      `Exception Handler: Requisição falhou p/ ${request.url}`
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
