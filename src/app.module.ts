import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { IssuerModule } from './issuer/issuer.module';
import { CredentialModule } from './credential/credential.module';
import { ProofModule } from './proof/proof.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { ReputationModule } from './reputation/reputation.module';
import { StellarModule } from './stellar/stellar.module';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './health/health.module';
import { Issuer } from './common/database/entities/issuer.entity';
import { CredentialType } from './common/database/entities/credential-type.entity';
import { Credential } from './common/database/entities/credential.entity';
import { Proof } from './common/database/entities/proof.entity';
import { Verification } from './common/database/entities/verification.entity';

/**
 * Startup env-var validation. Every variable the app dereferences at request
 * time (Stellar keys, contract IDs, DB/Redis URLs, JWT secret) is validated
 * here so a misconfigured deployment fails fast at boot with a clear error
 * instead of throwing deep inside a request handler the first time it's hit
 * (e.g. `Keypair.fromSecret(undefined)` in StellarService).
 */
const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),

  STELLAR_NETWORK: Joi.string().valid('testnet', 'mainnet').default('testnet'),
  STELLAR_ADMIN_SECRET: Joi.string().required(),

  ISSUER_REGISTRY_CONTRACT: Joi.string().required(),
  REPUTATION_REGISTRY_CONTRACT: Joi.string().required(),
  MARKETPLACE_CONTRACT: Joi.string().required(),

  IPFS_API_URL: Joi.string().uri().default('https://api.pinata.cloud'),
  IPFS_API_KEY: Joi.string().allow('').optional(),
  IPFS_API_SECRET: Joi.string().allow('').optional(),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(10),

  // Stricter throttler applied to expensive/chain-writing endpoints
  // (proof generation/revocation, IPFS upload, marketplace writes).
  STRICT_THROTTLE_TTL: Joi.number().default(60),
  STRICT_THROTTLE_LIMIT: Joi.number().default(5),

  PROOF_INDEXER_START_LEDGER: Joi.number().optional(),

  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  SWAGGER_EXPORT: Joi.string().allow('').optional(),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [Issuer, CredentialType, Credential, Proof, Verification],
        synchronize: true,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get('REDIS_URL'),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: parseInt(config.get('THROTTLE_TTL', '60'), 10),
            limit: parseInt(config.get('THROTTLE_LIMIT', '10'), 10),
          },
          {
            name: 'strict',
            ttl: parseInt(config.get('STRICT_THROTTLE_TTL', '60'), 10),
            limit: parseInt(config.get('STRICT_THROTTLE_LIMIT', '5'), 10),
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    StellarModule,
    AuthModule,
    IssuerModule,
    CredentialModule,
    ProofModule,
    ReputationModule,
    MarketplaceModule,
    HealthModule,
  ],
})
export class AppModule {}
