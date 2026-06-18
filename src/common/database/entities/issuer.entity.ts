import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { CredentialType } from './credential-type.entity';
import { Credential } from './credential.entity';

@Entity('issuers')
export class Issuer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  stellarAddress: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => CredentialType, (ct) => ct.issuer)
  credentialTypes: CredentialType[];

  @OneToMany(() => Credential, (c) => c.issuer)
  credentials: Credential[];
}
