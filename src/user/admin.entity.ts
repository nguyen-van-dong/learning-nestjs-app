import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AdminRole } from './admin-role.entity';
import { Exclude } from 'class-transformer';

@Entity({
  name: 'admins',
})
export class Admin {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
  })
  name!: string;

  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
  })
  email!: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  @Exclude()
  password!: string;

  @Column({
    type: 'boolean',
    default: true,
  })
  is_active!: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  is_super_admin!: boolean;

  @OneToMany(() => AdminRole, (adminRole) => adminRole.admin)
  adminRoles!: AdminRole[];

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
