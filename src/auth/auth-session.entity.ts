import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/user/user.entity';
import { RefreshToken } from './refresh-token.entity';

@Entity({ name: 'auth_sessions' })
@Index('idx_auth_sessions_user_active', ['user_id', 'revoked_at'])
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'integer' })
  user_id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 120, nullable: true })
  device_name!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  user_agent!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ip_address!: string | null;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  last_used_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  revoke_reason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @OneToMany(() => RefreshToken, (token) => token.session)
  refresh_tokens!: RefreshToken[];
}
