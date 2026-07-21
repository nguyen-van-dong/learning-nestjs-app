import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse();
    const statusCode = response.statusCode;

    return next.handle().pipe(
      map((result) => {
        if (result && result.data && result.meta) {
          return {
            statusCode,
            message: result.message || 'Successfully!',
            data: result.data,
            meta: result.meta,
          };
        }

        return {
          statusCode,
          message: result?.message || 'Successfully!',
          data: result?.data !== undefined ? result.data : result, 
        };
      }),
    );
  }
}
