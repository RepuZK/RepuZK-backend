import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Proof } from '../common/database/entities/proof.entity';
import { Credential } from '../common/database/entities/credential.entity';
import { ProofService } from './proof.service';
import { ProofController } from './proof.controller';
import { ProofGenerationProcessor } from './proof-generation.processor';
import { StellarSubmitProcessor } from './stellar-submit.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Proof, Credential]),
    BullModule.registerQueue(
      { name: 'proof-generation' },
      {
        name: 'stellar-submit',
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000, // 5 s, 10 s, 20 s
          },
          removeOnComplete: true,
          removeOnFail: false, // keep failed jobs for inspection
        },
      },
    ),
  ],
  providers: [ProofService, ProofGenerationProcessor, StellarSubmitProcessor],
  controllers: [ProofController],
  exports: [ProofService],
})
export class ProofModule {}
