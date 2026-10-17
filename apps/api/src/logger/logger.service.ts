import { Injectable, Logger } from '@nestjs/common';
import pino from 'pino';

@Injectable()
export class LoggerService extends Logger {
  private readonly pinoInstance: ReturnType<typeof pino>;
  private readonly isProd: boolean;

  constructor() {
    super();

    const level = process.env.LOG_LEVEL || 'info';
    const isProd = process.env.NODE_ENV === 'production';
    this.isProd = isProd;

    // 日志后端去 Datadog（依 global-cn-adaptation G1 / D6）：
    // - 生产：默认落文件（pino/file，可经 LOG_FILE 指定路径、滚动留待运维/后续 pino-roll）
    // - 开发 / 测试：pino-pretty 彩色控制台
    this.pinoInstance = pino(
      isProd
        ? {
            level,
            transport: {
              targets: [
                {
                  target: 'pino/file',
                  level,
                  options: {
                    destination: process.env.LOG_FILE || 'logs/app.log',
                    mkdir: true,
                  },
                },
              ],
            },
          }
        : {
            level,
            transport: {
              targets: [
                {
                  target: 'pino-pretty',
                  level,
                  options: {
                    colorize: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                    ignore: 'pid,hostname',
                  },
                },
              ],
            },
          },
    );
  }

  log(message: string, ...optionalParams: any[]): void {
    // prod 保留 Nest 默认行喂容器 stdout；dev 跳过（避免与 pino-pretty 双打）。
    if (this.isProd) super.log(message);
    const meta = optionalParams.find((p) => p && typeof p === 'object') as
      | Record<string, unknown>
      | undefined;
    if (meta) this.pinoInstance.info(meta, message);
    else this.pinoInstance.info(message);
  }

  error(message: string, ...optionalParams: any[]): void {
    const trace = optionalParams.find((p) => typeof p === 'string') as string | undefined;
    const meta = optionalParams.find((p) => p && typeof p === 'object') as
      | Record<string, unknown>
      | undefined;
    if (this.isProd) super.error(message, trace);
    this.pinoInstance.error({ ...(meta ?? {}), ...(trace ? { trace } : {}) }, message);
  }

  warn(message: string, ...optionalParams: any[]): void {
    if (this.isProd) super.warn(message);
    const meta = optionalParams.find((p) => p && typeof p === 'object') as
      | Record<string, unknown>
      | undefined;
    if (meta) this.pinoInstance.warn(meta, message);
    else this.pinoInstance.warn(message);
  }
}
