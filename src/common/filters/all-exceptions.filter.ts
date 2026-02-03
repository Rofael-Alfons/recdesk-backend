import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  correlationId: string;
}

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Get correlation ID from middleware or generate new one
    const correlationId =
      (request as any).correlationId ||
      (request.headers['x-correlation-id'] as string) ||
      uuidv4();

    // Determine status code and message
    let statusCode: number;
    let message: string | string[];
    let error: string;
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, any>;
        message = responseObj.message || exception.message;
        error = responseObj.error || HttpStatus[statusCode] || 'Error';
      } else {
        message = exceptionResponse;
        error = HttpStatus[statusCode] || 'Error';
      }
    } else if (exception instanceof Error) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';
      stack = exception.stack;

      // Log the full error for internal server errors
      this.logger.error(
        {
          correlationId,
          error: exception.message,
          stack: exception.stack,
        },
        'Unhandled exception',
      );
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      error = 'Internal Server Error';

      this.logger.error(
        {
          correlationId,
          exception: JSON.stringify(exception),
        },
        'Unknown exception type',
      );
    }

    // Log error details with structured format
    const logContext = {
      correlationId,
      method: request.method,
      url: request.url,
      statusCode,
      message,
      error,
    };

    if (statusCode >= 500) {
      this.logger.error(
        logContext,
        `${request.method} ${request.url} - ${statusCode}`,
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        logContext,
        `${request.method} ${request.url} - ${statusCode}`,
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
    };

    // Set correlation ID header in response
    response.setHeader('x-correlation-id', correlationId);

    response.status(statusCode).json(errorResponse);
  }
}
