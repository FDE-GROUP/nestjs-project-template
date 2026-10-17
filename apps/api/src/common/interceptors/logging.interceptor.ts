import { LoggerService } from '@app/logger/logger.service';
import { currentRequestId } from '@core/saas-kit/shared-kernel/context/request-context';
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

    // 人可读消息（首参·保留 `Request [id]` 前缀供回归测）+ pino 结构化字段（次参）：
    // dev pretty 对齐展示、prod JSON 可按 method/statusCode/responseTimeMs 检索。
    const bodySummary = body && Object.keys(body).length ? ` ${JSON.stringify(body)}` : '';
    this.loggerService.log(
      `Request [${requestId}]: ${method} ${url} - ${ip} - ${userAgent}${bodySummary}`,
      {
        requestId,
        method,
        url,
        ip,
        userAgent,
      },
    );

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - now;
          this.loggerService.log(
            `Response [${requestId}]: ${method} ${url} - ${responseTime}ms ${data && typeof data === 'object' ? JSON.stringify(data).substring(0, 100) : ''}`,
            { requestId, method, url, responseTimeMs: responseTime },
          );
        },
        error: (error) => {
          const responseTime = Date.now() - now;
          this.loggerService.error(
            `Response Error [${requestId}]: ${method} ${url} - ${responseTime}ms`,
            error.stack || JSON.stringify(error),
            {
              requestId,
              method,
              url,
              responseTimeMs: responseTime,
              statusCode: error?.status ?? error?.statusCode,
            },
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
