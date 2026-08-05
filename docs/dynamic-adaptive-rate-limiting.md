# Dynamic Adaptive Rate Limiting trong NestJS

## 1. Bài toán và ý tưởng chính

Rate limit truyền thống thường dùng một con số cố định, ví dụ mỗi IP được gọi
100 request/phút. Cách này đơn giản nhưng không phản ánh đầy đủ thực tế:

- API export report tốn tài nguyên hơn API đọc danh sách.
- User trả phí có thể được cấp quota cao hơn user miễn phí.
- Giờ cao điểm cần giới hạn chặt hơn giờ thấp điểm.
- Khi CPU, database pool hoặc queue gần quá tải, hệ thống cần tự bảo vệ.
- Operator cần thay đổi cấu hình mà không sửa business code của controller.

Module này giải quyết bài toán bằng cách bắt đầu từ `baseLimit`, sau đó lần lượt
áp dụng các policy độc lập để tính ra giới hạn cuối cùng:

```text
finalLimit = floor(
  baseLimit
  × timeMultiplier
  × userMultiplier
  × systemLoadMultiplier
  × apiPriorityMultiplier
)

finalLimit tối thiểu là 1
```

Ví dụ:

```text
baseLimit       = 100
time            = 0.5   (giờ cao điểm)
user            = 2     (gói Pro)
systemLoad      = 0.8   (CPU bắt đầu cao)
priority        = 0.5   (API ưu tiên thấp)

finalLimit = floor(100 × 0.5 × 2 × 0.8 × 0.5) = 40
```

Sau khi có limit, Guard tạo identity của caller và dùng Redis Fixed Window để
đếm số request trong cửa sổ thời gian hiện tại.

## 2. Các kỹ thuật và design pattern đã dùng

### Strategy Pattern

Mỗi policy là một strategy triển khai cùng interface `RateLimitPolicy`:

```ts
interface RateLimitPolicy {
  readonly name: string;
  readonly order: number;
  evaluate(context: RateLimitContext): Promise<RateLimitPolicyResult>;
}
```

Các strategy hiện tại gồm:

| Policy                       | Vai trò                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `TimeRateLimitPolicy`        | Điều chỉnh quota theo giờ và timezone                     |
| `UserRateLimitPolicy`        | Điều chỉnh theo subscription plan                         |
| `SystemLoadRateLimitPolicy`  | Giảm quota khi CPU, DB pool, queue hoặc latency tăng cao   |
| `ApiPriorityRateLimitPolicy` | Điều chỉnh theo độ ưu tiên được khai báo trên API          |

Nhờ Strategy Pattern, có thể thêm policy mới mà không sửa Guard hoặc Redis
storage. Ví dụ có thể thêm tenant policy, feature-flag policy hoặc abuse-score
policy.

### Policy Engine và Chain of Responsibility

`RateLimitPolicyEngine` nhận một mảng policy qua Dependency Injection, sắp xếp
theo `order` rồi chạy tuần tự. Kết quả của policy trước ảnh hưởng phép tính mà
policy sau tiếp tục sử dụng. Đây là cách thực thi gần với Chain of
Responsibility, nhưng mỗi handler không giữ reference trực tiếp đến handler kế
tiếp; Engine chịu trách nhiệm điều phối toàn bộ chain.

Engine cũng bảo vệ hệ thống trước kết quả policy không hợp lệ:

- `applied: false` được xem như multiplier `1`.
- Không chấp nhận `NaN`, `Infinity`, `0` hoặc số âm.
- Policy exception được log và fail-open với multiplier `1`.
- Kết quả cuối luôn ít nhất là `1`.

### Dependency Injection và Dependency Inversion

Core logic phụ thuộc interface và injection token thay vì concrete class:

```ts
RATE_LIMIT_POLICIES
RATE_LIMIT_STORAGE
SYSTEM_LOAD_PROVIDER
USER_PLAN_PROVIDER
RATE_LIMIT_OPTIONS
RATE_LIMIT_REDIS
```

Ví dụ `SystemLoadRateLimitPolicy` không tự đọc CPU hoặc BullMQ. Nó chỉ gọi
`SystemLoadProvider`. Vì vậy production có thể thay default provider bằng một
adapter lấy metric từ Prometheus, database pool hoặc queue mà không sửa policy.

Tương tự, Policy Engine không import trực tiếp danh sách concrete policy. Module
quyết định policy nào được đăng ký. `UserRateLimitPolicy` hiện mặc định bị tắt vì
project chưa có subscription plan hoàn chỉnh.

### Decorator và Reflector metadata

Controller khai báo rate limit bằng decorator:

```ts
@DynamicRateLimit({
  key: 'reports.export',
  baseLimit: 20,
  ttlSeconds: 60,
  priority: 'low',
})
```

Decorator dùng `SetMetadata`. Guard dùng `Reflector.getAllAndOverride()` với thứ
tự handler trước controller, do đó method-level metadata override
controller-level metadata.

Route không có decorator hoặc có `enabled: false` sẽ được bỏ qua. Vì vậy Guard
có thể đăng ký global mà không ảnh hưởng health check hay các API chưa opt-in.

### Adapter/abstraction cho storage algorithm

`RateLimitStorage` tách thuật toán lưu counter khỏi Guard và policy. Phiên bản
hiện tại là `RedisFixedWindowStorage`. Sau này có thể viết
`RedisSlidingWindowStorage` hoặc `RedisTokenBucketStorage`, rồi đổi provider cho
token `RATE_LIMIT_STORAGE` mà không đổi Guard.

### Atomic operation bằng Redis Lua

Fixed Window cần thực hiện ba hành động:

1. Tăng counter.
2. Nếu là request đầu tiên thì đặt expiry.
3. Đọc TTL còn lại.

Nếu gọi `INCR` và `EXPIRE` bằng hai command độc lập, process có thể chết sau
`INCR` nhưng trước `EXPIRE`, làm key không bao giờ hết hạn. Lua script chạy toàn
bộ thao tác atomically trong Redis, loại bỏ race condition đó.

Lua trả về current count và TTL. Nếu Redis trả TTL âm bất thường, storage dùng
`ttlSeconds` làm fallback. `remaining` luôn được clamp về tối thiểu `0`.

### Cache, timeout và graceful degradation

System metric không nên được đo lại cho từng request. Policy cache snapshot trong
một khoảng ngắn, mặc định 5 giây. Lời gọi provider có timeout mặc định 200ms để
không làm Guard treo theo hệ thống monitoring.

Khi provider lỗi hoặc timeout, policy log warning và dùng fallback multiplier,
mặc định `1`. Đây là fail-open cho monitoring: lỗi hệ thống đo metric không được
làm hỏng request nghiệp vụ.

### Dynamic Module

`RateLimitModule` hỗ trợ cả:

- `forRoot()` khi options có sẵn trực tiếp.
- `forRootAsync()` khi options đến từ `ConfigService`, secret manager hoặc remote
  config.

Project đang tích hợp bằng `forRootAsync()` trong `AppModule`.

## 3. Kiến trúc module

```text
src/rate-limit/
├── constants/      Injection token và metadata key
├── decorators/     @DynamicRateLimit()
├── examples/       ReportsController và PublicApiController
├── guards/         HTTP orchestration
├── interfaces/     Contract giữa các layer
├── policies/       Các Strategy
├── providers/      Adapter mặc định cho load và user plan
├── services/       Policy Engine, identity/key builder, facade service
├── storage/        Redis Fixed Window bằng Lua
├── rate-limit.module.ts
└── index.ts        Public API
```

Separation of concerns:

| Thành phần                    | Trách nhiệm                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| Decorator                     | Khai báo rule trên controller hoặc method                     |
| Guard                         | Đọc HTTP context, set header, chuyển exception HTTP            |
| `RateLimitPolicyEngine`       | Chạy và kết hợp các policy                                    |
| `RateLimitRuleService`        | Chọn identity, sanitize route key và hash identity             |
| `RateLimitService`            | Điều phối Engine, key builder và storage                       |
| Policy                        | Chỉ quyết định multiplier                                     |
| Storage                       | Chỉ đếm request và quản lý window                             |
| Provider                      | Cung cấp external/runtime data cho policy                      |

Business logic không nằm trong Guard. Guard chỉ là adapter giữa Nest HTTP và
domain rate-limit.

## 4. Request flow

```text
HTTP request
  → DynamicRateLimitGuard
    → đọc handler/controller metadata
    → không có metadata hoặc disabled: cho qua
    → chuyển request thành RateLimitContext
      → RateLimitPolicyEngine
        → Time policy
        → User policy nếu được bật
        → System-load policy
        → API-priority policy
      → tính finalLimit
      → RateLimitRuleService chọn và hash identity
      → RedisFixedWindowStorage chạy Lua consume
    → allowed: set header và cho qua
    → rejected: set Retry-After và trả HTTP 429
    → Redis lỗi:
      → fail-open: log lỗi và cho qua
      → fail-closed: trả HTTP 503
```

`RateLimitContext` là object độc lập với `ExecutionContext`. Nhờ vậy policy có
thể unit test dễ dàng và không bị khóa vào HTTP transport của NestJS.

## 5. Identity và Redis key

Thứ tự chọn identity:

1. `tenantId + userId`
2. `userId`
3. API key
4. IP

Không đưa raw identity trực tiếp vào Redis key. Module SHA-256 identity rồi lấy
một phần digest để:

- tránh key quá dài;
- không lộ API key, user ID hoặc IP khi xem Redis;
- hạn chế ký tự đặc biệt phá vỡ key convention.

Route key lấy từ decorator, không lấy query string. Dạng key logic:

```text
rate-limit:{sanitizedRouteKey}:{identityType}:{identityHash}
```

Redis `keyPrefix` có thể được cấu hình thêm ở connection level.

## 6. Fixed Window hoạt động thế nào?

Request đầu tiên tạo counter bằng `1` và đặt TTL. Các request tiếp theo tăng cùng
counter cho đến khi TTL hết. Khi key biến mất, request tiếp theo bắt đầu window
mới.

Ưu điểm:

- Dễ hiểu, tốc độ cao và ít tốn bộ nhớ.
- Mỗi identity/route chỉ cần một Redis key.
- Lua consume đơn giản và atomic.

Nhược điểm:

- Có burst ở ranh giới window. Caller có thể gửi gần `limit` request cuối window
  cũ và thêm `limit` request ngay đầu window mới.
- Không mượt bằng Sliding Window hoặc Token Bucket.

Kiến trúc storage abstraction cho phép thay thuật toán khi yêu cầu sản phẩm cao
hơn.

## 7. Fail-open và fail-closed

Lỗi policy monitoring và lỗi Redis có ý nghĩa khác nhau.

Policy monitoring mặc định fail-open vì metric không phải source of truth của
request. Redis storage hỗ trợ cấu hình:

```dotenv
RATE_LIMIT_FAILURE_MODE=fail-open
```

| Mode          | Khi Redis lỗi                                               |
| ------------- | ------------------------------------------------------------ |
| `fail-open`   | Log error và cho request đi qua; ưu tiên availability        |
| `fail-closed` | Trả HTTP 503; ưu tiên bảo vệ tài nguyên và security           |

Không trả 429 khi Redis lỗi. HTTP 429 nghĩa là caller thực sự vượt quota; HTTP
503 nghĩa là dịch vụ rate limiting không sẵn sàng.

Login, OTP, password reset hoặc API có rủi ro abuse cao thường cân nhắc
fail-closed. API nội bộ hoặc read-only ít rủi ro có thể chọn fail-open.

## 8. Response contract

Request được xử lý sẽ có:

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
```

Request bị reject có thêm:

```text
Retry-After
```

Response 429 chứa limit, remaining, retry time và reset time, nhưng không expose
CPU, database pool, queue depth hoặc policy nội bộ.

## 9. Cấu hình hiện tại

```dotenv
RATE_LIMIT_TIMEZONE=Asia/Ho_Chi_Minh
RATE_LIMIT_FAILURE_MODE=fail-open
RATE_LIMIT_LOAD_TIMEOUT_MS=200
RATE_LIMIT_LOAD_CACHE_TTL_MS=5000
RATE_LIMIT_DEBUG=false

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
RATE_LIMIT_REDIS_DB=0
```

Default system-load provider chỉ trả snapshot rỗng để application chạy an toàn.
Muốn adaptive theo tải thật, cần cung cấp implementation của
`SystemLoadProvider` và override token `SYSTEM_LOAD_PROVIDER`.

User policy cũng mặc định chưa được đưa vào policy array. Khi JWT/request user có
subscription plan đáng tin cậy, bật `enableUserPolicy` và cung cấp
`UserPlanProvider` phù hợp. Nếu phải query database, provider nên cache kết quả;
không query database trực tiếp trong policy ở mỗi request.

## 10. Testing đã triển khai

Bộ Jest kiểm tra các nhóm hành vi:

- Engine: empty policies, skip, multiplication, ordering, invalid multiplier và
  minimum limit.
- Time policy: timezone Việt Nam, peak time, midnight range và no-match.
- User policy: anonymous, free, pro, business và unknown plan.
- System load: low/high CPU, conservative multiplier, provider error và timeout.
- Redis: một Lua call atomic, counter result, reject, non-negative remaining và
  invalid TTL fallback.
- Guard: no decorator, disabled decorator, user identity, headers, HTTP 429,
  fail-open và fail-closed.

Chạy kiểm tra:

```bash
npm run build
npm test -- --runInBand --no-watchman
npx eslint "src/rate-limit/**/*.ts"
```

## 11. Observability và bảo mật

Module dùng NestJS `Logger`, không log authorization header, raw API key hoặc raw
identity. Debug log chỉ hiển thị identity đã redacted.

`RateLimitObserver` đã định nghĩa boundary cho các metric:

```text
rate_limit_allowed_total
rate_limit_rejected_total
rate_limit_storage_errors_total
rate_limit_policy_errors_total
```

Production có thể cung cấp adapter Prometheus/OpenTelemetry ở bước tiếp theo.
Không nên dùng `routeKey`, `userId` hoặc IP không giới hạn làm metric label vì sẽ
tạo high cardinality.

## 12. Trade-off và hướng phát triển

- Thay Fixed Window bằng Sliding Window hoặc Token Bucket cho traffic cần burst
  control mượt hơn.
- Dùng Redis Cluster cần bảo đảm các key tham gia cùng Lua script nằm cùng hash
  slot. Script hiện chỉ thao tác một key nên tương thích tốt.
- Có thể preload Lua bằng `SCRIPT LOAD` và gọi `EVALSHA` để giảm bandwidth, đồng
  thời fallback `EVAL` khi Redis mất script cache.
- Cần real system-load provider trước khi policy tải có hiệu lực thực tế.
- Có thể thêm runtime configuration repository với cache 30–60 giây và cơ chế
  invalidate.
- Với nhiều instance, Redis cung cấp counter dùng chung; in-memory counter không
  đảm bảo global limit.
- Proxy/load balancer phải cấu hình `trust proxy` đúng trước khi tin
  `request.ip`, nếu không mọi caller có thể cùng mang IP của proxy hoặc spoof
  forwarded header.

# Câu hỏi và trả lời phỏng vấn

## 1. Rate limiting dùng để làm gì?

Rate limiting kiểm soát số request một caller được phép gửi trong một khoảng
thời gian. Nó bảo vệ hệ thống trước abuse, traffic burst và resource exhaustion,
đồng thời hỗ trợ phân chia quota theo user hoặc subscription plan.

## 2. Dynamic adaptive rate limiting khác fixed rate limiting thế nào?

Fixed rate limiting luôn dùng một quota cố định. Dynamic adaptive rate limiting
tính quota tại runtime dựa trên route, user plan, thời gian, tải hệ thống và độ
ưu tiên API. Nhờ đó hệ thống có thể nới quota khi rảnh và tự bảo vệ khi tải cao.

## 3. Tại sao dùng Strategy Pattern cho policy?

Vì mỗi yếu tố điều chỉnh quota là một thuật toán độc lập. Strategy giúp thêm,
xóa hoặc thay thế policy mà không sửa Guard và Policy Engine. Nó tăng khả năng
test riêng lẻ và tuân theo Open/Closed Principle.

## 4. Implementation này có thật sự là Chain of Responsibility không?

Nó có cách thực thi giống Chain of Responsibility vì policy chạy tuần tự theo
order. Tuy nhiên policy không tự trỏ đến policy kế tiếp; một Policy Engine trung
tâm điều phối chain. Cách này phù hợp với DI của NestJS và giúp quan sát toàn bộ
kết quả policy dễ hơn.

## 5. Tại sao policy không nhận `ExecutionContext`?

`ExecutionContext` là chi tiết framework/transport. Guard chuyển nó thành
`RateLimitContext` thuần. Policy nhờ đó ít coupling, dễ unit test và có thể tái
sử dụng ngoài HTTP nếu sau này cần áp dụng cho RPC hoặc WebSocket.

## 6. Handler và controller cùng có decorator thì cái nào thắng?

Handler thắng. Guard gọi `Reflector.getAllAndOverride()` với handler trước
controller. Controller cung cấp default, method chỉ override khi cần quota riêng.

## 7. Tại sao Guard được đăng ký global nhưng không giới hạn mọi API?

Guard dùng opt-in metadata. Nếu không tìm thấy `@DynamicRateLimit()` hoặc
`enabled: false`, nó trả `true` ngay. Vì vậy health check hoặc route chưa opt-in
không bị ảnh hưởng.

## 8. Tại sao không đặt toàn bộ logic trong Guard?

Guard nên chỉ chuyển đổi HTTP input/output. Nếu chứa policy calculation, identity
logic và Redis algorithm, class sẽ khó test, khó thay storage và vi phạm Single
Responsibility Principle. Implementation tách các trách nhiệm thành Engine,
RuleService, RateLimitService và Storage.

## 9. Vì sao dùng Redis thay vì memory trong process?

Ứng dụng production thường chạy nhiều instance. Counter trong memory chỉ đúng
trên từng instance và bị mất khi restart. Redis tạo một counter dùng chung, hỗ
trợ TTL và atomic operation cho toàn cluster ứng dụng.

## 10. Race condition của `INCR` rồi `EXPIRE` là gì?

Nếu process hoặc network lỗi sau `INCR` nhưng trước `EXPIRE`, key có thể tồn tại
vĩnh viễn. Hai client đồng thời cũng làm flow khó đảm bảo. Lua chạy increment,
conditional expiry và TTL lookup như một atomic operation trong Redis.

## 11. Fixed Window có nhược điểm gì?

Nó cho phép burst tại ranh giới cửa sổ. Ví dụ quota 100/phút, caller có thể gửi
100 request ở giây 59 và 100 request tiếp theo ở giây 60. Sliding Window giảm vấn
đề này nhưng tốn tài nguyên hơn.

## 12. So sánh Fixed Window, Sliding Window và Token Bucket?

| Thuật toán      | Đặc điểm                                                    |
| --------------- | ----------------------------------------------------------- |
| Fixed Window    | Đơn giản, nhanh, ít memory nhưng burst ở ranh giới          |
| Sliding Window  | Chính xác và mượt hơn, chi phí storage/compute cao hơn       |
| Token Bucket    | Cho phép burst có kiểm soát, phù hợp traffic không đều       |

## 13. Vì sao multiplier của system load lấy `Math.min` thay vì nhân nhau?

CPU, DB pool, queue và latency có thể cùng phản ánh một nguyên nhân quá tải. Nhân
tất cả multiplier sẽ phạt lặp và bóp quota quá mạnh. Lấy giá trị nhỏ nhất chọn
tín hiệu bảo thủ nhất mà không compound nhiều lần.

## 14. Tại sao system-load provider cần cache?

Đọc CPU, DB pool hoặc queue cho mỗi HTTP request vừa tốn chi phí vừa tạo thêm tải
khi hệ thống đang bận. Snapshot cache 5–10 giây đủ nhanh để phản ứng nhưng giảm
đáng kể overhead.

## 15. Tại sao provider cần timeout?

Guard nằm trên critical request path. Nếu monitoring provider bị treo, toàn bộ
API cũng có thể treo. Timeout giới hạn thời gian chờ và chuyển sang fallback
multiplier.

## 16. Fail-open và fail-closed khác nhau thế nào?

Fail-open cho request đi qua khi rate-limit storage lỗi, ưu tiên availability.
Fail-closed từ chối bằng 503, ưu tiên security và resource protection. Lựa chọn
phụ thuộc mức rủi ro của API.

## 17. Tại sao Redis lỗi trả 503 thay vì 429?

429 khẳng định caller đã vượt quota. Khi Redis lỗi, hệ thống không biết điều đó
có đúng hay không. 503 diễn đạt chính xác rằng dependency phục vụ rate limiting
đang không sẵn sàng.

## 18. Tại sao identity phải hash?

Hash giới hạn độ dài key, chuẩn hóa ký tự và tránh lộ IP, user ID hoặc API key
trong Redis/log. Route key cũng được sanitize và không lấy từ query string để
tránh cardinality không giới hạn.

## 19. IP có phải identity đáng tin cậy không?

Không hoàn toàn. Nhiều user có thể chung NAT, IP có thể thay đổi và forwarded
header có thể bị spoof nếu proxy cấu hình sai. User ID hoặc API key tốt hơn khi
có authentication. IP chỉ nên là fallback cho anonymous request.

## 20. Vì sao User policy không query database trực tiếp?

Query database trên mỗi request làm tăng latency và tải DB ngay trong Guard.
Plan nên có trong JWT/request user nếu dữ liệu phù hợp, hoặc được lấy qua provider
có cache và chiến lược invalidate rõ ràng.

## 21. Có rủi ro gì khi lưu plan trong JWT?

JWT có thể chứa plan cũ cho đến khi hết hạn. Nếu việc nâng/hạ plan cần hiệu lực
ngay, nên dùng access token TTL ngắn, token version, session lookup hoặc cache có
invalidation. Đây là trade-off giữa tốc độ và tính nhất quán.

## 22. Policy trả multiplier không hợp lệ thì xử lý thế nào?

Engine reject `NaN`, `Infinity`, `0` và số âm, log warning rồi fail-open policy
đó với multiplier `1`. Việc này ngăn config lỗi biến final limit thành giá trị
không sử dụng được hoặc làm hỏng request.

## 23. Vì sao final limit tối thiểu là 1?

Multiplier nhỏ có thể làm phép floor thành `0`. Limit 0 thường đồng nghĩa khóa
toàn bộ route ngoài ý muốn. Clamp về 1 duy trì khả năng phục vụ tối thiểu. Nếu
muốn tắt route hoàn toàn nên dùng feature flag hoặc circuit breaker rõ nghĩa.

## 24. `X-RateLimit-Reset` và `Retry-After` khác nhau thế nào?

`X-RateLimit-Reset` cho biết thời điểm Unix timestamp mà quota reset.
`Retry-After` cho biết số giây client nên đợi và chỉ được gửi khi request bị từ
chối.

## 25. Làm sao tránh expose thông tin hệ thống nhạy cảm?

Response chỉ trả limit và window data. CPU, DB utilization, queue depth và policy
debug chỉ dùng trong log nội bộ có kiểm soát. Không log raw token, API key hoặc
identity.

## 26. Làm sao thay Fixed Window mà không sửa Guard?

Viết class mới triển khai `RateLimitStorage`, sau đó bind class đó vào token
`RATE_LIMIT_STORAGE`. Guard chỉ gọi contract `consume()` nên không biết thuật
toán cụ thể phía sau.

## 27. Rate limiting có thay thế authentication hoặc authorization không?

Không. Authentication xác định caller, authorization quyết định caller được làm
gì, còn rate limiting quyết định caller được làm bao nhiêu lần. Ba cơ chế bổ sung
cho nhau.

## 28. Rate limiter khác circuit breaker thế nào?

Rate limiter kiểm soát tốc độ request theo caller/route. Circuit breaker theo dõi
lỗi của dependency và tạm ngừng gọi dependency khi nó không khỏe. Adaptive rate
limit có thể giảm tải, nhưng không thay thế circuit breaker.

## 29. Test Lua atomic như thế nào?

Unit test xác nhận storage chỉ gọi một `eval`, script chứa increment/expiry và
mapping output đúng. Integration test tốt hơn nên chạy nhiều consumer đồng thời
trên Redis thật/Testcontainers, sau đó xác nhận counter, TTL và không có key mất
expiry.

## 30. Nếu hệ thống chạy Redis Cluster thì cần chú ý gì?

Lua script chỉ được thao tác các key cùng hash slot. Script hiện dùng một key nên
an toàn. Nếu mở rộng sang nhiều key, cần Redis hash tag như `{identity}` để đảm
bảo chúng cùng slot hoặc thiết kế lại operation.

## 31. Những metric nào nên theo dõi?

Tối thiểu gồm allowed, rejected, storage error và policy error theo route key ổn
định. Ngoài ra nên theo dõi Redis latency, timeout rate, current limit
distribution và tỷ lệ 429. Tránh label theo user/IP vì high cardinality.

## 32. Nếu được cải tiến tiếp, ưu tiên việc gì?

Ưu tiên theo nhu cầu thực tế:

1. Gắn real system-load provider và metrics exporter.
2. Thêm Redis integration/concurrency test.
3. Bổ sung runtime rule repository với cache/invalidation.
4. Chọn Sliding Window hoặc Token Bucket nếu boundary burst là vấn đề.
5. Thêm plan provider nhất quán với auth/subscription domain.
