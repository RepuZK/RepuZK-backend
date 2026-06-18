import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Verification } from '../common/database/entities/verification.entity';
import { ReputationService } from './reputation.service';
import { ReputationController } from './reputation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Verification])],
  providers: [ReputationService],
  controllers: [ReputationController],
})
export class ReputationModule {}
