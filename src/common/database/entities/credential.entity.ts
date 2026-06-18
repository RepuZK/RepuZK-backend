import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Issuer } from './issuer.entity';

@Entity('credentials')
export class Credential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Issuer, (i) => i.credentials)
  issuer: Issuer;

  @Column()
  userAddress: string;

  @Column()
  credentialType: string;

  @Column({ type: 'jsonb' })
  payloadJson: object;

  @Column()
  payloadHash: string;

  @Column({ nullable: true })
  ipfsCid: string;

  @CreateDateColumn()
  issuedAt: Date;

  @Column({ nullable: true })
  expiresAt: Date;
}
