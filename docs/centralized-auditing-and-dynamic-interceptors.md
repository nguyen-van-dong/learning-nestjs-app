# Centralized Auditing & Dynamic Interceptors

## 1. Mục tiêu

Module audit log ghi lại lịch sử thay đổi dữ liệu của các HTTP API:

- Ai thực hiện: user, admin, anonymous hoặc system.
- Thực hiện hành động gì: method, route và business action.
- Thực hiện lúc nào.
- Resource nào bị thay đổi.
- Trạng thái trước và sau thay đổi.
- Các field thực sự thay đổi.
- Request mất bao lâu và trả về status code nào.

Audit log khác application log. Application log phục vụ debug và vận hành,
thường có thể bị rotate. Audit log là dữ liệu nghiệp vụ có cấu trúc, có thể tìm
kiếm, và nên được giữ theo chính sách retention rõ ràng.

## 2. Kiến trúc được triển khai

Các thành phần chính nằm trong `src/audit-log`:

| Thành phần              | Trách nhiệm                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| `AuditLogModule`        | Dynamic/global module, cung cấp toàn bộ audit providers                 |
| `AuditLogInterceptor`   | Tạo request context, lấy actor/route/method, đo duration và persist log |
| `AuditContextService`   | Giữ context riêng cho từng request bằng `AsyncLocalStorage`             |
| `AuditLogService`       | Nhận mutation, sanitize, tính diff, lưu và truy vấn audit log           |
| `AuditSanitizerService` | Đệ quy che password, token và secret                                    |
| `AuditDiffService`      | So sánh snapshot trước/sau ở cấp field                                  |
| `AuditLog`              | TypeORM entity ánh xạ bảng `audit_logs`                                 |
| `AuditLogController`    | API admin tìm kiếm và xem audit log                                     |
| `@AuditAction()`        | Gán tên business action cho handler                                     |
| `@SkipAudit()`          | Bỏ qua audit cho handler/controller                                     |

Luồng xử lý:

```text
Guard xác thực
  -> AuditLogInterceptor tạo AsyncLocalStorage context
    -> Controller
      -> Service thay đổi database
      -> AuditLogService.recordCreate/Update/Delete()
    -> Handler thành công
  -> Interceptor persist tất cả mutation cùng request_id
-> Trả response
```

Interceptor không dùng request body làm `after`. Request body là ý định của
client, không phải trạng thái thực tế trong database. Entity sau `save()` mới có
thể chứa default value, generated ID, timestamp hoặc giá trị do business logic
thay đổi.

## 3. Database schema

Migration:

```text
src/database/migrations/1785250000000-CreateAuditLogsTable.ts
```

Các field quan trọng:

| Field                        | Ý nghĩa                                                |
| ---------------------------- | ------------------------------------------------------ |
| `request_id`                 | Nhóm nhiều thay đổi phát sinh từ cùng một HTTP request |
| `actor_type`, `actor_id`     | Danh tính người thực hiện                              |
| `action`                     | `CREATE`, `UPDATE`, `DELETE` hoặc business action      |
| `method`, `route`            | HTTP operation                                         |
| `entity_type`, `entity_id`   | Resource bị thay đổi                                   |
| `before_data`, `after_data`  | Snapshot dạng PostgreSQL `jsonb`                       |
| `changes`                    | Chỉ các field khác nhau                                |
| `status_code`, `duration_ms` | Kết quả và thời gian xử lý                             |
| `ip_address`, `user_agent`   | Thông tin nguồn request                                |
| `created_at`                 | Thời điểm audit record được tạo                        |

`actor_id` và `entity_id` không có foreign key. Nếu user bị xóa, lịch sử audit
vẫn phải tồn tại. ID được lưu dạng string để module có thể audit entity dùng
numeric ID hoặc UUID.

### Index

Module tạo index cho:

- actor và thời gian;
- entity và thời gian;
- request ID;
- thời gian tạo.

Index giúp các truy vấn điều tra phổ biến nhưng làm tăng chi phí insert và dung
lượng lưu trữ. Chỉ thêm index dựa trên query thực tế.

## 4. Cấu hình module động

`AppModule` dùng `forRootAsync()`:

```ts
AuditLogModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    enabled: configService.get<string>('AUDIT_LOG_ENABLED', 'true') === 'true',
    failureMode: configService.get<'non-blocking' | 'strict'>(
      'AUDIT_LOG_FAILURE_MODE',
      'non-blocking',
    ),
    excludedRoutes: ['/api/auth/login', '/api/admin/auth/login'],
  }),
});
```

Biến môi trường:

```dotenv
AUDIT_LOG_ENABLED=true
AUDIT_LOG_FAILURE_MODE=non-blocking
```

Module cũng hỗ trợ cấu hình đồng bộ:

```ts
AuditLogModule.forRoot({
  enabled: true,
  includeMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  excludedRoutes: ['/api/auth/login'],
  sensitiveFields: ['apiKey'],
  failureMode: 'non-blocking',
});
```

### `forRoot()` và `forRootAsync()` khác nhau thế nào?

`forRoot()` phù hợp khi options đã có sẵn lúc khai báo module.

`forRootAsync()` phù hợp khi options phụ thuộc provider khác, ví dụ
`ConfigService`, secret manager hoặc remote configuration. `useFactory` được
Nest gọi sau khi các dependency trong `inject` đã sẵn sàng.

### Custom provider và injection token

Options không phải một class nên được đăng ký bằng token:

```ts
export const AUDIT_LOG_OPTIONS = Symbol('AUDIT_LOG_OPTIONS');
```

Provider:

```ts
{
  provide: AUDIT_LOG_OPTIONS,
  useValue: options,
}
```

Consumer:

```ts
constructor(
  @Inject(AUDIT_LOG_OPTIONS)
  private readonly options: AuditLogModuleOptions,
) {}
```

Dùng `Symbol` hạn chế trùng token với module khác.

## 5. Interceptor và `ExecutionContext`

Interceptor triển khai interface:

```ts
intercept(
  context: ExecutionContext,
  next: CallHandler,
): Observable<unknown>
```

`ExecutionContext` cung cấp:

- loại transport: HTTP, RPC hoặc WebSocket;
- controller class hiện tại;
- handler method hiện tại;
- request và response khi chuyển sang HTTP context.

Ví dụ:

```ts
const request = context.switchToHttp().getRequest();
const response = context.switchToHttp().getResponse();
const handler = context.getHandler();
const controller = context.getClass();
```

### Request lifecycle liên quan

Thứ tự rút gọn:

```text
Middleware
-> Guard
-> Interceptor (before)
-> Pipe
-> Controller/Service
-> Interceptor (after)
-> Exception filter nếu có lỗi
```

Guard chạy trước interceptor nên `AuthGuard` đã gắn `request.user`, hoặc
`AdminAuthGuard` đã gắn `request.admin`, trước khi audit resolver đọc actor.

### Vì sao đăng ký bằng `APP_INTERCEPTOR`?

Không nên khởi tạo:

```ts
app.useGlobalInterceptors(new AuditLogInterceptor());
```

Instance tạo thủ công không được Nest resolve các dependency như repository,
`Reflector`, config và audit service.

Module đăng ký:

```ts
{
  provide: APP_INTERCEPTOR,
  useClass: AuditLogInterceptor,
}
```

Nhờ đó interceptor vừa global vừa được dependency injection quản lý.

### RxJS trong interceptor

`next.handle()` trả về `Observable`, không phải giá trị response trực tiếp.
Code sử dụng `concatMap()` để đợi thao tác persist audit hoàn tất rồi mới chuyển
response value ra ngoài.

Nếu controller throw error thì success pipeline không chạy, do đó mutation được
thu thập trong memory nhưng không được persist. Điều này tránh tạo audit record
khẳng định một thay đổi thành công khi handler thất bại.

Một HTTP handler thông thường emit một response value. Nếu áp dụng interceptor
cho streaming endpoint emit nhiều value, cần thay chiến lược để chỉ flush một
lần khi stream hoàn tất.

## 6. Request context với `AsyncLocalStorage`

Không nên truyền các tham số `actorId`, `route`, `requestId` qua mọi controller
và service. `AsyncLocalStorage` cung cấp một store riêng cho mỗi asynchronous
execution chain.

Interceptor tạo store:

```ts
{
  requestId,
  actorType,
  actorId,
  method,
  route,
  startedAt,
  mutations: [],
}
```

Service ở sâu trong call stack chỉ cần gọi:

```ts
auditLogService.recordUpdate('User', before, after);
```

`AuditContextService` tự tìm store của request hiện tại.

### Tại sao không dùng biến global?

Node.js xử lý nhiều request xen kẽ trong cùng process. Một biến global có thể bị
request B ghi đè trong khi request A đang `await`, làm audit sai actor.
`AsyncLocalStorage` giữ context theo async chain và tránh trộn dữ liệu giữa các
request.

### Giới hạn

Context có thể mất nếu code dùng thư viện callback không tương thích với async
hooks hoặc chủ động chạy công việc ở process khác. Queue worker phải tạo system
context riêng; nó không thể kế thừa context từ HTTP process.

## 7. Ghi nhận mutation

Sau khi tạo:

```ts
const savedUser = await repository.save(user);
auditLogService.recordCreate('User', savedUser);
```

Khi cập nhật:

```ts
const before = { ...user };
user.name = dto.name;
const after = await repository.save(user);
auditLogService.recordUpdate('User', before, after);
```

Khi xóa:

```ts
const before = await repository.findOneByOrFail({ id });
await repository.remove(before);
auditLogService.recordDelete('User', before);
```

Snapshot `before` phải được chụp trước khi mutate entity. Nếu gán field rồi mới
spread object, cả hai snapshot sẽ có giá trị mới.

### `save()` và `update()` trong TypeORM

`save(entity)` làm việc với entity đã được load. Ta có thể giữ snapshot cũ và
nhận entity sau khi lưu.

`update(criteria, partial)` chạy update query trực tiếp. Nó không load entity và
không đảm bảo subscriber có đầy đủ `databaseEntity`. Để audit chính xác:

1. load các row trước update;
2. thực hiện update;
3. dựng/read snapshot sau update;
4. gọi `recordUpdate()` cho từng entity.

Các luồng token hiện tại trong `AuthService` áp dụng pattern này cho bulk update.

### Vì sao không chỉ dùng TypeORM subscriber?

Subscriber hữu ích nhưng không giải quyết hoàn toàn:

- bulk `update()` có thể không có snapshot cũ;
- raw SQL có thể bypass entity lifecycle;
- subscriber khó biết business action;
- một API có thể thay đổi nhiều entity;
- cần gắn mutation với HTTP request context.

Subscriber có thể là lớp tự động hóa bổ sung, nhưng service-level recording là
điểm đảm bảo tính chính xác trong implementation hiện tại.

## 8. Sanitization và diff

Audit log là dữ liệu lâu dài nên rò rỉ credential ở đây đặc biệt nguy hiểm.
Sanitizer duyệt object, nested object và array, rồi thay giá trị nhạy cảm bằng:

```text
[REDACTED]
```

Tên field được normalize, vì vậy `token_hash`, `token-hash` và `tokenHash` được
so sánh theo cùng một dạng.

Các field mặc định gồm:

- password;
- token và token hash;
- authorization;
- cookie;
- secret;
- access/refresh token.

Có thể bổ sung field bằng `sensitiveFields` trong options.

Diff chỉ được tính sau sanitization. Điều này bảo đảm hash/password cũ và mới
không xuất hiện gián tiếp trong `changes`.

Diff hiện tại ở cấp top-level field. Nếu một nested object thay đổi, toàn bộ
nested field được coi là một thay đổi. Có thể mở rộng thành deep diff nếu domain
cần query tới từng nested property.

## 9. Decorators và metadata

Bỏ qua audit:

```ts
@Post('login')
@SkipAudit()
login() {}
```

Đặt business action:

```ts
@Post('register')
@AuditAction('USER_REGISTERED')
register() {}
```

Decorator dùng `SetMetadata()`. Interceptor dùng `Reflector`:

```ts
reflector.getAllAndOverride(KEY, [context.getHandler(), context.getClass()]);
```

`getAllAndOverride()` cho phép metadata ở handler override metadata ở controller.
Đây là pattern phổ biến cho permissions, caching, throttling và feature flags.

## 10. Actor resolution

Implementation hỗ trợ:

- Admin: `request.admin.id`.
- User: `request.user.id` hoặc `request.user.sub`.
- Chưa đăng nhập: `anonymous`, `actorId = null`.

User JWT trong dự án hiện dùng `id`, admin JWT dùng `sub`. Resolver chấp nhận cả
hai. Về lâu dài nên chuẩn hóa JWT subject vào claim `sub`.

Đăng ký tài khoản được audit dưới actor `anonymous` vì user chưa có token tại
thời điểm gọi API. Entity ID của user mới vẫn nằm trong `entity_id`.

## 11. Failure mode và transaction

`non-blocking`:

- nếu ghi audit lỗi, application ghi error log;
- business response vẫn thành công;
- phù hợp khi availability quan trọng hơn audit consistency tuyệt đối.

`strict`:

- lỗi ghi audit làm HTTP response thất bại;
- trong implementation hiện tại, nó **không tự rollback business transaction**
  vì audit được persist sau khi controller/service hoàn tất.

Nếu yêu cầu compliance bắt buộc atomic:

1. business mutation và audit insert phải dùng cùng `EntityManager`;
2. audit record phải được insert trước khi transaction commit;
3. failure phải rollback cả hai;
4. hoặc dùng transactional outbox rồi chuyển audit event sang kho immutable.

Không nên tuyên bố “strict = atomic” nếu audit insert nằm ngoài business
transaction.

## 12. API đọc audit log

Permission:

```text
audit-log.read
```

Endpoints:

```http
GET /api/admin/audit-logs
GET /api/admin/audit-logs/:id
```

Query parameters:

- `actorType`
- `actorId`
- `action`
- `entityType`
- `entityId`
- `requestId`
- `page`
- `limit` (tối đa 100)

Ví dụ:

```http
GET /api/admin/audit-logs?entityType=User&entityId=42&page=1&limit=20
Authorization: Bearer <admin-token>
```

Super admin vượt qua permission check theo `PermissionGuard`. Admin thường cần
chạy seeder để role được gắn permission mới.

## 13. Cách chạy

Build:

```bash
npm run build
```

Chạy migration:

```bash
npm run migration:run
```

Seed permission:

```bash
npm run seed
```

Test:

```bash
npm test
```

Các unit test audit kiểm tra:

- recursive redaction;
- normalize tên sensitive field;
- date và circular reference;
- diff field thêm/xóa/thay đổi;
- isolation của async request context.

## 14. Checklist khi thêm API mutation mới

1. Xác định API có thực sự thay đổi persistent data hay chỉ là command không
   mutation.
2. Chụp snapshot trước khi thay đổi.
3. Thực hiện mutation trong transaction nếu có nhiều write liên quan.
4. Gọi đúng `recordCreate`, `recordUpdate` hoặc `recordDelete`.
5. Dùng `@AuditAction()` nếu cần tên nghiệp vụ.
6. Không đưa secret chưa được sanitizer hỗ trợ vào custom object.
7. Viết test chứng minh before/after đúng.
8. Test rollback/error không tạo success audit.
9. Với bulk update, audit từng row hoặc ghi một aggregate event có chủ đích.
10. Với queue/cron, tạo actor `system` và correlation ID riêng.

## 15. Những cải tiến production có thể làm tiếp

- Partition bảng theo tháng nếu số lượng log lớn.
- Retention/archival policy.
- Deep diff hoặc JSON Patch.
- Filter theo khoảng thời gian.
- Export audit report.
- Cryptographic hash chain để phát hiện chỉnh sửa audit record.
- Chỉ cho database role insert/select, không cho update/delete audit row.
- Transactional outbox.
- Trace ID tích hợp OpenTelemetry.
- Audit cho queue worker bằng system context.
- Pseudonymization IP/user-agent theo chính sách riêng tư.

## 16. Câu hỏi phỏng vấn và gợi ý trả lời

### 1. NestJS interceptor dùng để làm gì?

Interceptor bao quanh handler execution. Nó phù hợp cho logging, metrics,
response transformation, caching, timeout và cross-cutting concern. Interceptor
có thể chạy logic trước handler và biến đổi `Observable` sau handler.

### 2. Interceptor khác middleware thế nào?

Middleware chạy sớm và chủ yếu làm việc với request/response của HTTP adapter.
Interceptor biết controller/handler thông qua `ExecutionContext`, được tích hợp
với DI/metadata và có thể xử lý cả trước lẫn sau handler.

### 3. Interceptor khác guard thế nào?

Guard quyết định request có được phép chạy handler hay không. Interceptor bao
quanh handler để bổ sung behavior. Authentication/authorization thuộc guard;
timing/audit orchestration thuộc interceptor.

### 4. Interceptor khác exception filter thế nào?

Exception filter biến exception thành response hoặc xử lý lỗi tập trung.
Interceptor có thể bắt lỗi bằng RxJS nhưng nhiệm vụ chính không phải định dạng
HTTP exception. Dùng đúng abstraction giúp code dễ bảo trì.

### 5. `ExecutionContext` cung cấp những gì?

Nó mở rộng `ArgumentsHost`, cho biết transport type, controller class, handler
function và cho phép lấy HTTP request/response, RPC data/context hoặc WebSocket
client/data.

### 6. Vì sao `next.handle()` trả về Observable?

Nest xây request handling quanh RxJS để interceptor có thể compose, transform,
catch error, timeout hoặc delay execution bằng operators. Promise từ controller
được Nest chuyển vào stream.

### 7. `tap`, `map`, `catchError`, `finalize`, `concatMap` khác gì?

- `tap`: side effect, không đổi value.
- `map`: biến đổi value đồng bộ.
- `catchError`: xử lý/thay thế error stream.
- `finalize`: chạy khi stream complete hoặc error, không phù hợp để emit value.
- `concatMap`: map sang inner Observable và đợi tuần tự; hữu ích khi phải đợi
  persist audit trước khi trả response.

### 8. Vì sao không `new` một interceptor có dependency?

Object tạo thủ công nằm ngoài Nest container nên constructor injection, scope,
lifecycle hook và provider override khi test không hoạt động đúng. Đăng ký bằng
`APP_INTERCEPTOR` để Nest tạo instance.

### 9. Dynamic module là gì?

Dynamic module là module trả về `DynamicModule` từ static method như `forRoot`.
Nó cho phép consumers cấu hình imports/providers/exports tại runtime bootstrap.

### 10. Khi nào dùng `forRootAsync()`?

Khi options phụ thuộc provider cần DI hoặc async initialization, ví dụ
`ConfigService`, secrets manager hoặc config lấy từ remote source.

### 11. `useValue`, `useFactory`, `useClass`, `useExisting` khác nhau thế nào?

- `useValue`: dùng object có sẵn.
- `useFactory`: gọi function để tạo value, có thể inject dependency.
- `useClass`: Nest instantiate class mới cho token.
- `useExisting`: alias tới provider instance đã tồn tại.

### 12. Vì sao dùng injection token?

Interface TypeScript bị xóa ở runtime nên không thể dùng làm DI token. String,
symbol hoặc class tồn tại ở runtime có thể làm token. `Symbol` giảm nguy cơ
collision.

### 13. `@Global()` có lợi và hại gì?

Module global giúp provider khả dụng mà không import lại ở từng feature module.
Nhưng dependency trở nên ít rõ ràng và dễ tạo hidden coupling. Chỉ nên global
cho infrastructure thật sự cross-cutting.

### 14. `AsyncLocalStorage` giải quyết vấn đề gì?

Nó giữ request-scoped context xuyên qua các `await` mà không truyền tham số qua
mọi layer. Các use case gồm correlation ID, tracing, tenant ID và audit actor.

### 15. Tại sao không dùng request-scoped provider?

Request scope cũng giải quyết isolation nhưng tạo provider graph riêng theo
request và có overhead/propagation constraints. `AsyncLocalStorage` nhẹ và phù
hợp với context data; request scope phù hợp khi toàn bộ instance thật sự cần
state riêng.

### 16. Làm sao bảo đảm context không bị trộn giữa request?

Mỗi request phải chạy trong một `AsyncLocalStorage.run(store, callback)` riêng.
Không lưu store vào biến singleton mutable. Viết concurrency test với nhiều
async chain là cách kiểm chứng tốt.

### 17. Tại sao request body không phải `after` snapshot?

Body có thể thiếu field, bị validation/transform, bị business logic sửa, hoặc
database thêm generated/default columns. Snapshot sau persist mới phản ánh
trạng thái thực.

### 18. Vì sao `Repository.update()` khó audit hơn `save()`?

`update()` phát SQL trực tiếp và không load entity hiện tại. Subscriber/event có
thể chỉ nhận partial data. Muốn before/after chính xác phải query snapshot hoặc
dùng database feature như `RETURNING`.

### 19. Audit log nên nằm cùng transaction không?

Nếu yêu cầu atomic/compliance, nên cùng transaction hoặc qua transactional
outbox. Nếu ưu tiên availability, có thể ghi ngoài transaction theo
non-blocking mode và chấp nhận rủi ro audit insert thất bại.

### 20. Audit failure có nên làm business request thất bại?

Không có đáp án chung. Banking/compliance thường fail closed. Product analytics
hoặc operational audit có thể fail open. Quyết định phải dựa trên yêu cầu, được
cấu hình và được monitor.

### 21. Làm sao audit DELETE khi row không còn tồn tại?

Load và giữ snapshot trước delete, sau đó lưu `before_data`; `after_data` là
`null`. Không đặt foreign key bắt buộc từ audit row đến resource đã xóa.

### 22. Làm sao bảo vệ dữ liệu nhạy cảm?

Whitelist dữ liệu cần audit hoặc blacklist/redact đệ quy trước persist. Không
lưu password, token, authorization header hoặc cookie. Cần test cả nested object
và các biến thể tên field.

### 23. Audit log có nên cho update/delete không?

Thông thường không. Nên dùng database permission, append-only policy, archival
và có thể hash chain/WORM storage để tăng tính tamper-evident.

### 24. JSONB có ưu/nhược điểm gì?

Ưu điểm: schema linh hoạt, giữ snapshot tự nhiên, PostgreSQL có operator/index.
Nhược điểm: khó enforce schema, row lớn, query phức tạp và có thể tạo index nặng.

### 25. Làm sao xử lý một request thay đổi nhiều entity?

Tạo một audit record cho mỗi mutation và dùng chung `request_id`. Cách này cho
phép truy vấn theo entity đồng thời tái dựng toàn bộ hành động theo request.

### 26. Làm sao audit job chạy nền?

Worker không có HTTP request hoặc user guard. Tạo context với actor `system`,
job ID làm correlation ID và có thể lưu `initiatedBy` nếu job bắt nguồn từ user.

### 27. Vì sao login được `@SkipAudit()`?

Login không thay đổi business entity trong implementation này. Login
success/failure nên thuộc security event log riêng, với rate-limit và retention
khác. Nếu login cập nhật `last_login_at`, mutation đó có thể được audit.

### 28. Làm sao test interceptor?

Mock `ExecutionContext`, `CallHandler`, response và audit service; subscribe vào
Observable; assert actor/method/route/duration và việc persist chỉ xảy ra sau
success. E2E test phải xác nhận row thực tế trong database.

### 29. Điều gì xảy ra nếu handler stream nhiều response?

Operator hiện tại có thể persist cho mỗi emission. Cần buffer mutation và flush
một lần khi stream complete, hoặc loại streaming route khỏi audit interceptor.

### 30. Thiết kế hiện tại còn giới hạn nào?

- Service mutation phải gọi `record*()` có chủ đích.
- Diff mới ở top-level.
- Strict mode chưa atomic với business transaction.
- Chưa audit queue worker.
- Chưa có time-range filter/retention/partition.

Nói rõ giới hạn là một phần quan trọng của thiết kế production; “centralized”
không đồng nghĩa hệ thống có thể tự suy luận mọi database side effect.
