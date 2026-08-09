import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RepuZK API')
    .setDescription('Privacy-preserving reputation infrastructure for the Stellar ecosystem')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, document);
  }
  if (process.env.SWAGGER_EXPORT) {
    writeFileSync('openapi.json', JSON.stringify(document, null, 2));
  }

  await app.listen(process.env.PORT ?? 3000);
  console.log(`RepuZK backend running on port ${process.env.PORT ?? 3000}`);
}
bootstrap();
