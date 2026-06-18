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

  @Column({ type: 'jsonb' })
  proofJson: object;

  @Column({ type: 'jsonb' })
  publicSignalsJson: object;

  @Column()
  circuitName: string;

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
