# TypeORM migrations và seeding trong NestJS

Tài liệu này tóm tắt những phần đã học và triển khai trong dự án `learning-app`:

- Cấu hình TypeORM CLI bằng `DataSource`.
- Tạo, generate, chạy và hoàn tác migration.
- Tạo bảng `users`, các bảng token và bảng `roles`.
- Tạo seeder cho roles và tài khoản admin.
- Xử lý các lỗi thường gặp khi generate migration và chạy seeder.

## 1. Những file đã thay đổi

Theo `git status`, các file đã được chỉnh sửa:

| File | Nội dung |
| --- | --- |
| `.env.example` | Đổi `DB_SYNCHRONIZE` từ `true` thành `false`. |
| `package.json` | Thêm các scripts cho TypeORM migration và seeding. |

Các file mới:

| File | Nội dung |
| --- | --- |
| `src/database/data-source.ts` | Cấu hình DataSource dành cho TypeORM CLI. |
| `src/database/migrations/1785169297468-CreateUserTable.ts` | Tạo bảng users, email verification tokens và password reset tokens. |
| `src/database/migrations/1785169948266-CreateRoleTable.ts` | Tạo bảng roles. |
| `src/database/migrations/1785171615496-AddUniqueConstraintToRoleName.ts` | Thêm unique constraint cho `roles.name`. |
| `src/database/seeds/seed.ts` | Entry point chạy toàn bộ seeders. |
| `src/database/seeds/role.seeder.ts` | Seed các role mặc định. |
| `src/database/seeds/admin.seeder.ts` | Seed tài khoản admin mặc định. |
| `src/user/role.entity.ts` | Khai báo entity cho bảng roles. |

## 2. `npm` và `npx`

- `npm` được dùng để cài đặt, gỡ và quản lý package hoặc chạy scripts trong `package.json`.
- `npx` được dùng để chạy executable do một package cung cấp, thường lấy từ `node_modules/.bin`.

Ví dụ:

```bash
npm install typeorm
npm run migration:run
npx typeorm migration:create src/database/migrations/CreateExampleTable
```

Các package hỗ trợ chạy TypeORM CLI với file TypeScript:

```bash
npm install -D ts-node typeorm-ts-node-commonjs
```

- `ts-node` cho phép chạy TypeScript mà không cần tự compile trước.
- `typeorm-ts-node-commonjs` chạy TypeORM CLI trong dự án CommonJS thông qua `ts-node`.

Dự án hiện tại build trước rồi sử dụng DataSource đã compile trong `dist`.

## 3. Cấu hình DataSource

TypeORM CLI chạy độc lập với dependency injection của NestJS nên cần một DataSource riêng:

```ts
// src/database/data-source.ts
import 'dotenv/config';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,

  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],

  synchronize: false,
  migrationsTableName: 'migrations',
});
```

Luôn giữ:

```env
DB_SYNCHRONIZE=false
```

Đặc biệt không dùng `synchronize=true` trong production. Migration giúp các thay đổi schema có lịch sử, có thể kiểm tra và triển khai nhất quán giữa các môi trường.

## 4. Các scripts hiện tại

Các scripts TypeORM và seeding trong `package.json`:

```json
{
  "scripts": {
    "typeorm": "npm run build && npx typeorm-ts-node-commonjs -d dist/database/data-source.js",
    "migration:create": "typeorm-ts-node-commonjs migration:create",
    "migration:generate": "npm run typeorm -- migration:generate src/database/migrations/$npm_config_name",
    "migration:run": "npm run typeorm -- migration:run",
    "migration:revert": "npm run typeorm -- migration:revert",
    "seed": "npm run build && node dist/database/seeds/seed.js"
  }
}
```

## 5. Vòng đời migration

### Generate migration

```bash
npm run migration:generate --name=CreateRoleTable
```

`migration:generate`:

- Kết nối tới database bằng DataSource.
- Đọc tất cả entities.
- So sánh toàn bộ entity metadata với schema hiện tại.
- Tạo migration chứa tất cả khác biệt tìm thấy.

Tên `CreateRoleTable` chỉ là tên file. Nó không giới hạn TypeORM chỉ kiểm tra entity `Role`.

Nếu TypeORM báo:

```text
No changes in database schema were found
```

thì entity metadata và schema database đã giống nhau. Một nguyên nhân thường gặp là trước đó ứng dụng từng chạy với `DB_SYNCHRONIZE=true`, khiến bảng đã được tự động tạo.

Để tạo initial migration, có thể generate trên một database local trống với `DB_SYNCHRONIZE=false`.

### Create migration

```bash
npm run migration:create -- src/database/migrations/CreateExampleTable
```

`migration:create` chỉ tạo file migration rỗng. Lệnh này:

- Không kết nối database.
- Không cần DataSource.
- Không chấp nhận tham số `-d`.
- Yêu cầu lập trình viên tự viết `up()` và `down()`.

Không chạy `migration:create` thông qua script `typeorm` hiện tại, vì script đó tự thêm `-d` và sẽ gây lỗi:

```text
Unknown argument: d
```

### Chạy migration

```bash
npm run migration:run
```

TypeORM gọi `up()` của tất cả migration chưa chạy theo thứ tự timestamp và ghi nhận chúng trong bảng `migrations`.

### Hoàn tác migration

```bash
npm run migration:revert
```

TypeORM gọi `down()` của migration đã chạy gần nhất. Mỗi lần gọi chỉ hoàn tác một migration.

Các thao tác như `DROP TABLE` hoặc `DROP COLUMN` trong `down()` có thể làm mất dữ liệu, vì vậy phải kiểm tra kỹ trước khi revert trên production.

## 6. Lỗi entity trùng bảng

Khi tạo `role.entity.ts`, file ban đầu bị sao chép từ `user.entity.ts` nhưng vẫn khai báo:

```ts
@Entity({ name: 'users' })
export class User {}
```

Kết quả là TypeORM nhìn thấy hai entity cùng ánh xạ tới bảng `users`, nhưng có tập hợp cột khác nhau. Migration được generate chứa nhiều lệnh bất thường:

```sql
ALTER TABLE "users" DROP COLUMN ...
ALTER TABLE "users" ADD ...
```

Cách sửa là đảm bảo entity mới có tên class và tên bảng riêng:

```ts
@Entity({ name: 'roles' })
export class Role {}
```

Luôn đọc lại nội dung migration được generate trước khi chạy, đặc biệt với các lệnh:

- `DROP TABLE`
- `DROP COLUMN`
- Thay đổi kiểu dữ liệu
- Thay đổi enum
- Thay đổi foreign key hoặc unique constraint

## 7. Entity Role và unique constraint

`Role` hiện có cột `name` unique:

```ts
@Column({
  type: 'varchar',
  length: 100,
  unique: true,
})
name!: string;
```

Migration đầu tiên tạo bảng roles chưa có unique constraint. Vì migration đó đã chạy nên một migration mới được tạo để bổ sung:

```sql
ALTER TABLE "roles"
ADD CONSTRAINT "UQ_648e3f5447f725579d7d4ffdfb7"
UNIQUE ("name");
```

Không nên chỉ sửa một migration cũ đã chạy, vì TypeORM sẽ không tự chạy lại migration đã được ghi nhận.

## 8. Seeding

NestJS và TypeORM không có sẵn lệnh tương đương `php artisan db:seed`. Dự án sử dụng một script riêng:

```bash
npm run seed
```

Quy trình:

```text
npm run build
→ node dist/database/seeds/seed.js
→ kết nối database
→ seed roles
→ seed admin
→ đóng kết nối
```

Entry point gọi seeders theo thứ tự:

```ts
await seedRoles(dataSource);
await seedAdmin(dataSource);
```

Nên seed bảng cha hoặc dữ liệu tham chiếu trước, sau đó mới seed bảng phụ thuộc bằng foreign key.

### Seed roles bằng upsert

Các role mặc định:

```text
admin
user
moderator
```

Seeder sử dụng:

```ts
repository.upsert(data, {
  conflictPaths: ['name'],
  skipUpdateIfNoValuesChanged: true,
});
```

Seeder nhờ vậy có tính idempotent: có thể chạy nhiều lần mà không tạo role trùng.

PostgreSQL yêu cầu cột dùng trong `ON CONFLICT` phải có unique hoặc exclusion constraint. Nếu `roles.name` chưa unique, seeder báo:

```text
there is no unique or exclusion constraint matching
the ON CONFLICT specification
```

Cách xử lý là thêm `unique: true` vào entity, tạo migration bổ sung unique constraint, chạy migration rồi chạy lại seeder:

```bash
npm run migration:run
npm run seed
```

## 9. Migration và seeder khác nhau

| Migration | Seeder |
| --- | --- |
| Quản lý cấu trúc database | Tạo dữ liệu ban đầu hoặc dữ liệu mẫu |
| Tạo bảng, cột, index và constraint | Tạo roles, admin hoặc danh mục mặc định |
| Có `up()` và `down()` | Thường được viết để chạy lặp lại an toàn |
| Có lịch sử trong bảng `migrations` | Seeder tự viết hiện tại không có bảng lịch sử |

Thứ tự triển khai thông thường:

```bash
npm run migration:run
npm run seed
```

## 10. Lưu ý bảo mật

Seeder admin hiện đang chứa email và mật khẩu trực tiếp trong source code. Trước khi sử dụng ngoài môi trường local, nên chuyển chúng sang biến môi trường:

```env
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-me
```

Seeder cần kiểm tra các biến này tồn tại, hash mật khẩu và không ghi mật khẩu ra log. Không commit mật khẩu thật vào Git.

## 11. Checklist khi thay đổi database

1. Sửa hoặc tạo entity.
2. Kiểm tra mỗi entity ánh xạ đúng tên bảng.
3. Generate migration.
4. Đọc kỹ `up()` và `down()`.
5. Chạy migration trên database local.
6. Chạy và kiểm tra ứng dụng.
7. Chạy seeder nếu cần dữ liệu mặc định.
8. Commit entity, migration và seeder cùng nhau.
9. Giữ `DB_SYNCHRONIZE=false`.

