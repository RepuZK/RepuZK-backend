import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { StellarService } from '../stellar/stellar.service';
import { ProofService } from './proof.service';

@Processor('stellar-submit')
export class StellarSubmitProcessor {
  private readonly logger = new Logger(StellarSubmitProcessor.name);

  constructor(
    private readonly stellar: StellarService,
    private readonly proofService: ProofService,
  ) {}

  @Process('submit')
  async handleSubmit(job: Job) {
    const { userAddress, issuerAddress, proofHash, credentialHash, credentialType, expiresAt, metadataUri, credentialId, proof, publicSignals, circuitName } = job.data;

    try {
      // Persist proof record before on-chain submission
      await this.proofService.registerProofOnChain({
        proofHash,
        credentialHash,
        credentialType,
        expiresAt,
        metadataUri,
        userAddress,
        issuerAddress,
        credentialId,
        proofJson: proof,
        publicSignalsJson: publicSignals,
        circuitName,
      });

      const txHash = await this.stellar.registerProof(
        userAddress,
        issuerAddress,
        Buffer.from(proofHash, 'hex'),
        Buffer.from(credentialHash, 'hex'),
        credentialType,
        expiresAt,
        metadataUri,
      );

      await this.proofService.updateStellarTxHash(proofHash, txHash);
      this.logger.log(`Proof ${proofHash} registered on-chain: ${txHash}`);
    } catch (err) {
      this.logger.error(`Stellar submit failed for proof ${proofHash}`, err);
      throw err; // Bull will retry
    }
  }
}
