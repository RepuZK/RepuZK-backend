import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { writeFileSync } from 'fs';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.use(helmet());

  const config = app.get(ConfigService);
  const corsOrigins = config
    .get('CORS_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((origin: string) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

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
