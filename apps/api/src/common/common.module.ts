import { type ExecutionContext, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { I18nValidationExceptionFilter } from 'nestjs-i18n';
import { LoggerModule } from '../logger/logger.module';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor';

// Localized validation errors keep the exact same response contract as the generic
// filter below (statusCode / message / error / timestamp / path) — only `message`
// content changes from raw i18n keys to translated strings.
const validationErrorBodyFormatter = (
  host: ExecutionContext,
  exception: { getStatus(): number },
  error: unknown,
) => {
  const request = host.switchToHttp().getRequest<{ url: string }>();
  return {
    statusCode: exception.getStatus(),
    message: error,
    error: 'Bad Request',
    timestamp: new Date().toISOString(),
    path: request.url,
  };
};

@Global()
@Module({
  imports: [LoggerModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Registered AFTER the catch-all HttpExceptionFilter on purpose: Nest reverses the
    // global filter list (external-exception-filter-context `filters.reverse()`), so the
    // LAST-registered filter is selected FIRST — making this one win for
    // I18nValidationException before the generic filter can leak untranslated keys.
    {
      provide: APP_FILTER,
      useFactory: () =>
        new I18nValidationExceptionFilter({
          detailedErrors: false,
          responseBodyFormatter: validationErrorBodyFormatter,
        }),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
  exports: [],
})
export class CommonModule {}
