import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('password_reset_tokens')
export class PasswordResetToken {
    @PrimaryGeneratedColumn()
    id!: number;

    @Index()
    @Column()
    user_id!: number;

    @ManyToOne(() => User, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'user_id' })
    user!: User;

    @Index({ unique: true })
    @Column({ length: 64 })
    token_hash!: string;

    @Column({ type: 'timestamptz' })
    expires_at!: Date;

    @Column({ type: 'timestamptz', nullable: true })
    used_at!: Date | null;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;
}
