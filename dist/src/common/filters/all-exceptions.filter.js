"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const nestjs_pino_1 = require("nestjs-pino");
let AllExceptionsFilter = class AllExceptionsFilter {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const correlationId = request.correlationId ||
            request.headers['x-correlation-id'] ||
            (0, uuid_1.v4)();
        let statusCode;
        let message;
        let error;
        let stack;
        if (exception instanceof common_1.HttpException) {
            statusCode = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
                const responseObj = exceptionResponse;
                message = responseObj.message || exception.message;
                error = responseObj.error || common_1.HttpStatus[statusCode] || 'Error';
            }
            else {
                message = exceptionResponse;
                error = common_1.HttpStatus[statusCode] || 'Error';
            }
        }
        else if (exception instanceof Error) {
            statusCode = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            message = 'Internal server error';
            error = 'Internal Server Error';
            stack = exception.stack;
            this.logger.error({
                correlationId,
                error: exception.message,
                stack: exception.stack,
            }, 'Unhandled exception');
        }
        else {
            statusCode = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            message = 'An unexpected error occurred';
            error = 'Internal Server Error';
            this.logger.error({
                correlationId,
                exception: JSON.stringify(exception),
            }, 'Unknown exception type');
        }
        const logContext = {
            correlationId,
            method: request.method,
            url: request.url,
            statusCode,
            message,
            error,
        };
        if (statusCode >= 500) {
            this.logger.error(logContext, `${request.method} ${request.url} - ${statusCode}`);
        }
        else if (statusCode >= 400) {
            this.logger.warn(logContext, `${request.method} ${request.url} - ${statusCode}`);
        }
        const errorResponse = {
            statusCode,
            message,
            error,
            timestamp: new Date().toISOString(),
            path: request.url,
            correlationId,
        };
        response.setHeader('x-correlation-id', correlationId);
        response.status(statusCode).json(errorResponse);
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Injectable)(),
    (0, common_1.Catch)(),
    __param(0, (0, nestjs_pino_1.InjectPinoLogger)(AllExceptionsFilter.name)),
    __metadata("design:paramtypes", [nestjs_pino_1.PinoLogger])
], AllExceptionsFilter);
//# sourceMappingURL=all-exceptions.filter.js.map