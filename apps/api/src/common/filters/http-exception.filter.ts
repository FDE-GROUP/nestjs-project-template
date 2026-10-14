import { LoggerService } from '@app/logger/logger.service';
import { currentRequestId } from '@core/saas-kit/shared-kernel/context/request-context';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  /** 请求关联 id：与 x-request-id 响应头、日志、领域事件 correlationId 同源（兜底链见 LoggingInterceptor）。 */
  requestId: string;
  /** 业务错误码：仅当异常以 object response 形态携带 `errorCode` 时透传（不引入自定义异常类）。 */
  errorCode?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LoggerService) private readonly loggerService: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const exceptionResponseObj = exceptionResponse as Record<string, unknown>;
        message = (exceptionResponseObj.message as string | string[]) || message;
        error = (exceptionResponseObj.error as string) || error;
        // 业务错误码走 HttpException 原生 object response 携带（如 throw new ForbiddenException({ message, errorCode }))
        if (typeof exceptionResponseObj.errorCode === 'string') {
          errorCode = exceptionResponseObj.errorCode;
        }
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const responseBody: ErrorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: currentRequestId() ?? String(request.id ?? 'req-unknown'),
      ...(errorCode !== undefined ? { errorCode } : {}),
    };

    if (status >= 500) {
      this.loggerService.error(
        `${request.method} ${request.url}`,
        exception instanceof Error
          ? exception.stack || 'No stack trace'
          : JSON.stringify(exception),
      );
    } else {
      this.loggerService.warn(`${request.method} ${request.url} - ${JSON.stringify(responseBody)}`);
    }

    reply.status(status).send(responseBody);
  }
}
