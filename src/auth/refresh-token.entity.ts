import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuthSession } from './auth-session.entity';

@Entity({ name: 'refresh_tokens' })
@Index('idx_refresh_tokens_token_hash', ['token_hash'], { unique: true })
@Index('idx_refresh_tokens_session_id', ['session_id'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  session_id!: string;

  @ManyToOne(() => AuthSession, (session) => session.refresh_tokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session!: AuthSession;

  @Column({ type: 'varchar', length: 64 })
  token_hash!: string;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumed_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replaced_by_token_id!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
