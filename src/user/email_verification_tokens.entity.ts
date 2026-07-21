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

@Entity('email_verification_tokens')
export class EmailVerificationToken {
    @PrimaryGeneratedColumn()
    id!: number;

    @Index()
    @Column()
    user_id!: number;

    @ManyToOne(() => User, (user) => user.verification_tokens, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'user_id' })
    user!: User;

    @Index({ unique: true })
    @Column({
        length: 255,
    })
    token_hash!: string;

    @Column({
        type: 'timestamp',
    })
    expires_at!: Date;

    @Column({
        type: 'timestamp',
        nullable: true,
    })
    used_at!: Date | null;

    @CreateDateColumn()
    created_at!: Date;
}
