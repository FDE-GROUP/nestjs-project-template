import { Injectable, Logger } from '@nestjs/common';
import pino from 'pino';

@Injectable()
export class LoggerService extends Logger {
  private readonly pinoInstance: ReturnType<typeof pino>;

  constructor() {
    super();

    const level = process.env.LOG_LEVEL || 'info';
    const isProd = process.env.NODE_ENV === 'production';

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
                  options: { colorize: true },
                },
              ],
            },
          },
    );
  }

  log(message: string): void {
    super.log(message);
    this.pinoInstance.info(message);
  }

  error(message: string, trace: string): void {
    super.error(message, trace);
    this.pinoInstance.error({ message, trace });
  }

  warn(message: string): void {
    super.warn(message);
    this.pinoInstance.warn(message);
  }
}
