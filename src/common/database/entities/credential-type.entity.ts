import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Issuer } from './issuer.entity';

@Entity('credential_types')
export class CredentialType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  typeId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  schemaJson: object;

  @Column({ default: false })
  requiresZk: boolean;

  @ManyToOne(() => Issuer, (i) => i.credentialTypes)
  issuer: Issuer;

  @CreateDateColumn()
  createdAt: Date;
}
