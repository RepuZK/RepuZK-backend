import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issuer } from '../common/database/entities/issuer.entity';
import { CredentialType } from '../common/database/entities/credential-type.entity';
import { Credential } from '../common/database/entities/credential.entity';
import { IssuerService } from './issuer.service';
import { IssuerController } from './issuer.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Issuer, CredentialType, Credential])],
  providers: [IssuerService],
  controllers: [IssuerController],
  exports: [IssuerService],
})
export class IssuerModule {}
