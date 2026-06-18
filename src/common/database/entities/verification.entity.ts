import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('verifications')
export class Verification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  requesterAddress: string;

  @Column()
  targetAddress: string;

  @Column()
  proofHash: string;

  @CreateDateColumn()
  requestedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  isValid: boolean;
}
