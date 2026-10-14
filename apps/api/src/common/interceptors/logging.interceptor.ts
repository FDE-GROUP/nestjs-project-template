import { LoggerService } from '@app/logger/logger.service';
import { currentRequestId } from '@core/shared-kernel/context/request-context';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject(LoggerService) private readonly loggerService: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, headers } = request;
    const userAgent = headers['user-agent'] || 'unknown';
    const ip = this.getClientIp(request);

    const now = Date.now();
    // 关联 id 统一链（FR-5）：读 onRequest hook 写入的 ALS 源，与响应头/event 表同 id；
    // 弃旧自造 `req-${now}-${Math.random()}` 孤岛。
    const requestId = currentRequestId() ?? String(request.id ?? 'req-unknown');

    this.loggerService.log(
      `Request [${requestId}]: ${method} ${url} - ${ip} - ${userAgent} ${body && Object.keys(body).length ? JSON.stringify(body) : ''}`,
    );

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - now;
          this.loggerService.log(
            `Response [${requestId}]: ${method} ${url} - ${responseTime}ms ${data && typeof data === 'object' ? JSON.stringify(data).substring(0, 100) : ''}`,
          );
        },
        error: (error) => {
          const responseTime = Date.now() - now;
          this.loggerService.error(
            `Response Error [${requestId}]: ${method} ${url} - ${responseTime}ms`,
            error.stack || JSON.stringify(error),
          );
        },
      }),
    );
  }

  private getClientIp(request: Record<string, any>): string {
    return (
      request.headers['x-forwarded-for'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }
}
