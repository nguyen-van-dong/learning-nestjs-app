# Quản lý phiên đăng nhập bằng refresh token

## Mục tiêu

Tính năng này giải quyết vòng đời xác thực JWT theo hướng an toàn hơn:

- Access token sống ngắn để giảm thời gian kẻ tấn công có thể sử dụng token bị
  đánh cắp.
- Refresh token dùng để cấp access token mới mà không yêu cầu người dùng đăng
  nhập lại.
- Mỗi thiết bị có một session riêng, có thể theo dõi và thu hồi độc lập.
- Refresh token được rotation sau mỗi lần sử dụng.
- Việc sử dụng lại token cũ được xem là dấu hiệu token có thể đã bị đánh cắp.
- Logout, đổi mật khẩu và thu hồi session có hiệu lực ngay.

## Vòng đời token

### 1. Đăng nhập

Khi đăng nhập thành công, server:

1. Tạo một bản ghi trong `auth_sessions` đại diện cho thiết bị hiện tại.
2. Sinh access token JWT có thời hạn mặc định 15 phút.
3. Sinh refresh token ngẫu nhiên 512-bit.
4. Chỉ lưu SHA-256 hash của refresh token vào bảng `refresh_tokens`.
5. Trả access token và refresh token gốc cho client.

Payload của access token gồm:

- `sub`: ID người dùng theo JWT convention.
- `id`: ID người dùng, được giữ để tương thích với code hiện tại.
- `sid`: ID session/thiết bị.
- `jti`: ID duy nhất của access token.
- `type`: luôn là `access`, tránh dùng nhầm loại token.
- `name`: tên người dùng.
- `iat`, `exp`: thời điểm phát hành và hết hạn do thư viện JWT thêm vào.

### 2. Làm mới token

Client gửi refresh token tới `POST /api/auth/refresh`. Server:

1. Hash token nhận được bằng SHA-256.
2. Tìm token trong DB và khóa bản ghi bằng `pessimistic_write`.
3. Kiểm tra token, session, người dùng và thời hạn.
4. Đánh dấu token hiện tại là đã sử dụng qua `consumed_at`.
5. Sinh refresh token mới và liên kết qua `replaced_by_token_id`.
6. Cấp access token mới.
7. Commit toàn bộ thay đổi trong cùng một transaction.

Client phải thay thế refresh token cũ bằng token mới một cách nguyên tử.

### 3. Phát hiện token reuse

Nếu một refresh token đã có `consumed_at` hoặc `revoked_at` lại được gửi lên,
server coi đây là dấu hiệu token có thể đã bị sao chép:

1. Đặt `revoke_reason = refresh_token_reuse`.
2. Revoke session của thiết bị.
3. Revoke toàn bộ refresh token thuộc session đó.
4. Từ chối cấp token mới với HTTP 401.

Thao tác revoke được commit trước khi exception được trả về. Nếu throw exception
ngay bên trong transaction, transaction có thể rollback và làm mất trạng thái
revoke.

### 4. Logout và thu hồi

- Logout bằng refresh token vẫn hoạt động khi access token đã hết hạn.
- Logout một thiết bị chỉ revoke session tương ứng.
- Logout tất cả thiết bị revoke mọi session đang hoạt động của người dùng.
- Người dùng chỉ được revoke session thuộc chính họ.
- Reset mật khẩu revoke toàn bộ session đang hoạt động.
- Auth guard kiểm tra session trong DB trên mỗi request, vì vậy access token của
  session đã bị revoke mất hiệu lực ngay, không cần chờ JWT hết hạn.

## Các kỹ thuật được áp dụng

### Access token ngắn hạn

Access token mặc định chỉ sống 15 phút. Token vẫn là stateless JWT để xác minh
chữ ký và thời hạn nhanh, nhưng có thêm `sid` để liên kết với session phía
server.

Đây là mô hình kết hợp:

- JWT cung cấp thông tin định danh và chống giả mạo.
- Session DB cung cấp khả năng revoke tức thời và quản lý nhiều thiết bị.

Đổi lại, mỗi request được bảo vệ cần thêm một truy vấn DB. Khi hệ thống lớn hơn,
có thể cache trạng thái session trong Redis với TTL ngắn.

### Opaque refresh token

Refresh token không phải JWT mà là chuỗi ngẫu nhiên không chứa thông tin nghiệp
vụ. Lợi ích:

- Không để lộ payload khi token bị đọc.
- Server toàn quyền kiểm soát trạng thái, thời hạn và revoke.
- Dễ rotation và phát hiện reuse.

Token được sinh bằng `crypto.randomBytes(64)`, tương đương 512 bit entropy.

### Hash token khi lưu trữ

DB chỉ lưu SHA-256 hash của refresh token. Cách làm tương tự lưu API key:

- Nếu DB bị lộ, kẻ tấn công không lấy được refresh token gốc để đăng nhập.
- Server hash token client gửi lên rồi so sánh với hash trong DB.

Refresh token có entropy rất cao nên SHA-256 phù hợp. Không cần dùng bcrypt như
mật khẩu vì token không có nguy cơ bị brute-force từ một không gian giá trị nhỏ
do con người lựa chọn.

### Refresh token rotation

Mỗi refresh token chỉ được sử dụng một lần. Sau khi sử dụng:

- Token cũ có `consumed_at`.
- Token mới được tạo.
- `replaced_by_token_id` lưu quan hệ rotation.

Cơ chế này giới hạn giá trị của refresh token bị đánh cắp và tạo dữ liệu để
nhận diện việc dùng lại token cũ.

### Token family và reuse detection

Trong implementation hiện tại, một session thiết bị đóng vai trò một token
family. Mọi refresh token được rotation trong cùng session đều thuộc cùng một
family.

Khi phát hiện reuse, toàn bộ family bị revoke thay vì chỉ token bị dùng lại.
Nếu chỉ revoke token cũ thì kẻ tấn công có thể đã sở hữu token mới hơn.

### Transaction và pessimistic locking

Refresh được thực hiện trong transaction và khóa token/session bằng
`pessimistic_write`. Điều này ngăn hai request đồng thời cùng sử dụng thành công
một refresh token.

Nếu không có row lock, cả hai request có thể cùng đọc `consumed_at = null`, sau
đó cùng sinh hai refresh token hợp lệ. Đây là race condition và phá vỡ quy tắc
single-use.

### Session theo thiết bị

Mỗi lần login tạo một session riêng với:

- `device_name`
- `user_agent`
- `ip_address`
- `created_at`
- `last_used_at`
- `expires_at`
- `revoked_at`
- `revoke_reason`

IP và user-agent chỉ nên dùng để hiển thị hoặc đánh giá rủi ro, không nên dùng
làm định danh tuyệt đối vì chúng có thể thay đổi hoặc bị giả mạo.

### Revoke tức thời

JWT thuần túy thường không thể bị revoke trước `exp`. Auth guard hiện kiểm tra:

- Chữ ký và thời hạn JWT.
- `type = access`.
- Session tồn tại và thuộc đúng người dùng.
- Session chưa hết hạn hoặc bị revoke.
- Tài khoản vẫn hoạt động.

Vì vậy logout/revoke có hiệu lực ngay. Trade-off là JWT không còn hoàn toàn
stateless.

### Tránh token confusion

Claim `type=access` được kiểm tra trong guard. Refresh token là opaque token và
không thể được gửi thay access token. Cách này ngăn việc một loại token bị dùng
nhầm tại endpoint dành cho loại token khác.

### Logout idempotent

Logout trả kết quả thành công kể cả khi refresh token không tồn tại hoặc session
đã bị revoke. Client có thể gọi lại an toàn, đồng thời response không làm lộ
token có tồn tại trong hệ thống hay không.

### Không lộ dữ liệu nhạy cảm

Response đăng nhập chỉ trả thông tin user được chọn rõ ràng, không spread toàn
bộ entity chứa password. Danh sách session cũng không trả token hash.

## Cấu hình

```dotenv
JWT_SECRET=thay-bang-mot-secret-dai-va-ngau-nhien
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d
```

Duration là số nguyên dương kèm một trong các đơn vị `s`, `m`, `h`, `d`.

Trước khi deploy, chạy migration:

```bash
npm run migration:run
```

## API

- `POST /api/auth/login`: nhận `email`, `password` và `device_name` không bắt
  buộc; trả `access_token`, `refresh_token`, `token_type`, `expires_in`.
- `POST /api/auth/refresh`: nhận `refresh_token` và rotation token pair.
- `POST /api/auth/logout`: nhận `refresh_token` và revoke session thiết bị.
- `POST /api/auth/logout-all`: yêu cầu Bearer access token và revoke tất cả
  session của người dùng.
- `GET /api/auth/sessions`: yêu cầu Bearer access token, trả danh sách thiết bị
  và đánh dấu session hiện tại.
- `POST /api/auth/sessions/:id/revoke`: yêu cầu Bearer access token và chỉ
  revoke session nếu nó thuộc người dùng hiện tại.

## Lưu ý phía client

- Sau mỗi lần refresh thành công, phải lưu refresh token mới trước khi bỏ token
  cũ.
- Không gửi nhiều refresh request đồng thời. Client nên dùng single-flight hoặc
  mutex để các request 401 cùng chờ một lần refresh chung.
- Nếu response refresh bị mất và client thử lại token cũ, server sẽ coi đó là
  reuse và revoke session. Đây là lựa chọn bảo mật nghiêm ngặt.
- Web client nên lưu refresh token trong cookie `Secure`, `HttpOnly`,
  `SameSite` và có CSRF protection cho refresh/logout.
- Không nên lưu refresh token trong `localStorage` nếu ứng dụng có thể dùng
  HttpOnly cookie, vì JavaScript và XSS có thể đọc localStorage.
- Native/mobile client nên dùng Keychain, Keystore hoặc secure storage của hệ
  điều hành.

## Câu hỏi phỏng vấn thường gặp

### 1. Vì sao cần cả access token và refresh token?

Access token sống ngắn giúp thu hẹp thời gian khai thác khi bị đánh cắp. Refresh
token sống dài hơn giúp duy trì đăng nhập mà không bắt người dùng nhập lại mật
khẩu. Refresh token được kiểm soát stateful nên có thể rotation và revoke.

### 2. Vì sao refresh token không nên có cùng thời hạn với access token?

Nếu cả hai cùng sống ngắn thì refresh token không mang lại trải nghiệm đăng nhập
lâu dài. Nếu access token sống dài như refresh token thì token bị đánh cắp có
thể truy cập API trong thời gian dài mà không cần qua kiểm tra session refresh.

### 3. Refresh token nên là JWT hay opaque token?

Cả hai đều có thể dùng, nhưng opaque token phù hợp khi server cần lưu trạng
thái, rotation, revoke và reuse detection. JWT refresh token không tự động mang
lại tính stateless nếu vẫn phải tra DB để xác định token đã bị revoke hay chưa.

### 4. Vì sao phải hash refresh token trong DB?

Để một vụ lộ DB không trực tiếp biến thành khả năng chiếm phiên đăng nhập. Kẻ
tấn công chỉ lấy được hash, không lấy được bearer credential gốc.

### 5. Vì sao hash refresh token bằng SHA-256 nhưng password dùng bcrypt?

Password thường có entropy thấp nên cần thuật toán chậm, có salt như bcrypt để
chống brute-force. Refresh token được sinh ngẫu nhiên với entropy rất cao, nên
hash nhanh SHA-256 vẫn an toàn và hiệu quả cho lookup.

### 6. Refresh token rotation là gì?

Mỗi lần refresh, token hiện tại bị đánh dấu đã dùng và một token mới được cấp.
Refresh token cũ không còn hợp lệ. Rotation giảm khả năng một token bị đánh cắp
được sử dụng lâu dài.

### 7. Phát hiện refresh token reuse như thế nào?

Server giữ lịch sử token đã rotation. Nếu token có `consumed_at` hoặc
`revoked_at` được gửi lại, server xác định token đã bị dùng nhiều hơn một lần và
revoke toàn bộ session/token family.

### 8. Tại sao reuse detection phải revoke cả token family?

Khi token cũ bị dùng lại, server không biết client hợp lệ hay kẻ tấn công đang
giữ token mới nhất. Revoke cả family buộc cả hai đăng nhập lại và chặn chuỗi
token có khả năng đã bị xâm nhập.

### 9. Race condition nào có thể xảy ra khi refresh?

Hai request đồng thời có thể cùng đọc token chưa được sử dụng và cùng cấp hai
token mới. Transaction kết hợp row lock đảm bảo chỉ một request rotation thành
công; request còn lại nhìn thấy token đã consumed và kích hoạt reuse detection.

### 10. JWT đã có `exp`, tại sao vẫn phải kiểm tra session trong DB?

`exp` chỉ giới hạn thời hạn, không hỗ trợ revoke tức thời. Kiểm tra session giúp
logout, khóa tài khoản, reset password và thao tác revoke có hiệu lực ngay. Đổi
lại là thêm state và truy vấn DB/cache.

### 11. `jti`, `sid` và `sub` khác nhau thế nào?

- `sub` xác định subject, ở đây là người dùng.
- `sid` xác định session/thiết bị đã phát hành token.
- `jti` xác định duy nhất một JWT cụ thể.

### 12. Logout access token hết hạn bằng cách nào?

Endpoint logout nhận refresh token, tìm session tương ứng rồi revoke session.
Do đó logout không phụ thuộc vào access token còn hạn.

### 13. Có nên lưu refresh token trong localStorage?

Thông thường không nên đối với web app vì XSS có thể đọc token. HttpOnly cookie
giảm rủi ro này, nhưng cần thêm `Secure`, `SameSite` và CSRF protection. Mobile
app nên dùng secure storage của hệ điều hành.

### 14. Làm sao hỗ trợ nhiều thiết bị?

Mỗi lần login tạo một session có ID riêng. Access token chứa `sid`, refresh
token thuộc session tương ứng. Người dùng có thể xem và revoke từng session mà
không ảnh hưởng thiết bị khác.

### 15. Absolute expiration và sliding expiration khác nhau thế nào?

- Absolute expiration: session hết hạn tại một thời điểm cố định kể từ login.
- Sliding expiration: mỗi lần hoạt động lại kéo dài hạn session.

Implementation hiện tại dùng absolute expiration: refresh token mới không được
sống lâu hơn `session.expires_at`. Cách này ngăn một session tồn tại vô hạn.

### 16. Làm sao xử lý nhiều API cùng nhận 401 trên client?

Dùng single-flight refresh: chỉ request đầu tiên thực hiện refresh, các request
còn lại chờ chung promise rồi retry bằng access token mới. Nếu tất cả tự refresh
đồng thời, rotation nghiêm ngặt có thể xem request thứ hai là reuse.

### 17. Có nên ràng buộc session cứng theo IP hoặc user-agent?

Không nên dùng làm điều kiện cứng vì IP có thể đổi, nhiều người dùng chung NAT,
user-agent có thể thay đổi hoặc bị giả mạo. Chúng phù hợp cho hiển thị thiết bị,
audit log, cảnh báo hoặc risk scoring.

### 18. Hệ thống này còn có thể cải thiện gì?

- Dùng HttpOnly cookie và CSRF protection cho web.
- Cache trạng thái session trong Redis để giảm tải DB.
- Thêm rate limit cho login và refresh.
- Thêm audit/security event khi phát hiện reuse.
- Gửi cảnh báo cho người dùng khi có login mới hoặc token reuse.
- Dọn token/session hết hạn bằng scheduled job.
- Quản lý JWT key rotation bằng `kid` và asymmetric signing như RS256/EdDSA.
- Giới hạn số session đồng thời trên mỗi tài khoản.
