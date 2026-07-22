import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(new Reflector()))

  // Transform response
  app.useGlobalInterceptors(new TransformInterceptor())

  // Apply filter global
  app.useGlobalFilters(new HttpExceptionFilter())

  app.setGlobalPrefix('api', {
    exclude: ['admin/queues'],
  });
  const port = process.env.PORT ?? 3000;

  await app.listen(port, () => {
    console.log(`Server is running on port ${port}` )
  });
}
bootstrap();
