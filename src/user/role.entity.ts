import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,

} from 'typeorm';
import { AdminRole } from './admin-role.entity';
import { RolePermission } from './role-permission.entity';

@Entity({
    name: 'roles',
})
export class Role {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({
        type: 'varchar',
        length: 100,
        unique: true,
    })
    name!: string;

    @OneToMany(() => AdminRole, (adminRole) => adminRole.role)
    adminRoles!: AdminRole[];

    @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
    permissions!: RolePermission[];

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
