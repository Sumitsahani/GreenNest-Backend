import { HttpStatus, type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { ErrorCode } from './common/constants/error-code';
import { BusinessException } from './common/exceptions/business.exception';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { toValidationDetails } from './common/validation/validation-details';

export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  app.use(helmet());
  app.enableCors({
    origin: config.get<string[]>('corsOrigins', []),
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'Idempotency-Key',
      'X-Support-Key',
    ],
    exposedHeaders: ['X-Request-ID'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors): BusinessException =>
        new BusinessException(
          ErrorCode.VALIDATION_ERROR,
          'Please correct the highlighted fields',
          HttpStatus.BAD_REQUEST,
          { details: toValidationDetails(errors) },
        ),
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor(), new ResponseInterceptor());
  app.enableShutdownHooks();
}
