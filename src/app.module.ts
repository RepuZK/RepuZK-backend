import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from './auth/auth.module';
import { IssuerModule } from './issuer/issuer.module';
import { CredentialModule } from './credential/credential.module';
import { ProofModule } from './proof/proof.module';
import { ReputationModule } from './reputation/reputation.module';
import { StellarModule } from './stellar/stellar.module';
import { RedisModule } from './common/redis/redis.module';
import { Issuer } from './common/database/entities/issuer.entity';
import { CredentialType } from './common/database/entities/credential-type.entity';
import { Credential } from './common/database/entities/credential.entity';
import { Proof } from './common/database/entities/proof.entity';
import { Verification } from './common/database/entities/verification.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    RedisModule,
    StellarModule,
    AuthModule,
    IssuerModule,
    CredentialModule,
    ProofModule,
    ReputationModule,
  ],
})
export class AppModule {}
