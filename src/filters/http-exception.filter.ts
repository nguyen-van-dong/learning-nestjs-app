import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    // Xác định status code (nếu là lỗi hệ thống không thuộc HttpException thì mặc định 500)
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Lấy message chi tiết của lỗi
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    let message = exception.message || 'Internal server';
    let error = 'Internal Server Error';

    if (exceptionResponse && typeof exceptionResponse === 'object') {
      message = (exceptionResponse as any).message || message;
      error = (exceptionResponse as any).error || error;
    }

    response.status(status).json({
      statusCode: status,
      message: message, // Có thể là chuỗi hoặc mảng các lỗi validator
      error: error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
