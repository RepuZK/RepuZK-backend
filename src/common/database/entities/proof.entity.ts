import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('proofs')
export class Proof {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userAddress: string;

  @Column()
  issuerAddress: string;

  @Column({ nullable: true })
  credentialId: string;

  @Column({ unique: true })
  proofHash: string;

  // Nullable: rows synced by ProofIndexerService from an on-chain event only
  // know the proof hash, not the full off-chain SnarkJS proof object.
  @Column({ type: 'jsonb', nullable: true })
  proofJson: object;

  @Column({ type: 'jsonb', nullable: true })
  publicSignalsJson: object;

  // Nullable for the same reason as proofJson/publicSignalsJson above.
  @Column({ nullable: true })
  circuitName: string;

  // True for rows created by ProofIndexerService from an on-chain event
  // rather than this backend's own generation pipeline.
  @Column({ default: false })
  syncedFromChain: boolean;

  @Column({ nullable: true })
  stellarTxHash: string;

  @Column({ nullable: true })
  metadataUri: string;

  @CreateDateColumn()
  registeredAt: Date;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ default: true })
  isActive: boolean;
}
