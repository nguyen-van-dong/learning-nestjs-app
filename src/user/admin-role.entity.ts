import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,

} from 'typeorm';
import { Admin } from './admin.entity';
import { Role } from './role.entity';

@Entity({
    name: 'admins_roles',
})
@Index(['admin', 'role'], { unique: true })
export class AdminRole {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Admin, (admin) => admin.adminRoles, {
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({
        name: 'admin_id',
    })
    admin!: Admin;

    @ManyToOne(() => Role, (role) => role.adminRoles, {
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({
        name: 'role_id',
    })
    role!: Role;

    @Column({
        type: 'boolean',
        default: true,
    })
    is_active!: boolean;
}
