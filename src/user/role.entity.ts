import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,

} from 'typeorm';

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
