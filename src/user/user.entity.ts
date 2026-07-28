import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,

} from 'typeorm';
import { Exclude } from 'class-transformer';
import { EmailVerificationToken } from './email-verification-tokens.entity';

@Entity({
    name: 'users',
})
export class User {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: 'varchar',
        length: 100,
    })
    name!: string;

    @Column({
        type: 'varchar',
        length: 255,
        unique: true,
    })
    email!: string;

    @Column({
        type: 'varchar',
        length: 255,
    })
    @Exclude()
    password!: string;

    @Column({
        type: 'boolean',
        default: false,
    })
    is_active!: boolean;

    @Column({
        type: 'timestamp',
        nullable: true,
    })
    email_verified_at!: Date | null;

    @OneToMany(
        () => EmailVerificationToken,
        (token) => token.user,
    )
    verification_tokens!: EmailVerificationToken[];

    @CreateDateColumn({
        name: 'created_at',
        type: 'timestamptz',
    })
    createdAt!: Date;

    @UpdateDateColumn({
        name: 'updated_at',
        type: 'timestamptz',
    })
    updatedAt!: Date;
}
