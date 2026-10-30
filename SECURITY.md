> **Bản cập nhật Phase4–5:** nhóm E2EE và file mã hóa đã có code. Đọc [hướng dẫn chạy](docs/PHASE4_5_QUICKSTART.md), [bàn giao](docs/PHASE4_5_DELIVERY.md), [giao thức v2](E2EE_PROTOCOL.md) và [tiến độ](docs/IMPLEMENTATION_STATUS.md). Mốc Phase1/2 bên dưới được giữ để đối chiếu lịch sử.

## Cập nhật UI + PIN

Đã có recovery độc lập bằng PIN + mã ngẫu nhiên, rate limit theo tài khoản ở DB, pepper/gate tách khỏi database và loại bỏ backup chỉ mở bằng mật khẩu sau enrollment. Đây không phải MFA đăng nhập hoặc PAKE được kiểm toán. Đọc [docs/RECOVERY_AND_POLISH.md](docs/RECOVERY_AND_POLISH.md) cho threat model hiện hành; phần password backup bên dưới chỉ còn áp dụng tài khoản chưa chuyển đổi.


> **Bản tiếp nối Phase 2 + UI nền Phase 3:** xem [hướng dẫn chạy](docs/PHASE2_QUICKSTART.md), [tiến độ](docs/IMPLEMENTATION_STATUS.md) và [bàn giao](docs/PHASE2_DELIVERY.md). Các mục Phase 1 bên dưới là mốc trước nâng cấp.

# Bảo mật và mô hình đe dọa

## Trạng thái

Prototype phục vụ học tập, chưa đủ điều kiện production. Phase1 sửa cache, kiểm tra cặp khóa, migration và dependency. CSRF token, CSP, verification, PIN/recovery v2, MFA/RBAC, DDoS nhiều lớp và giao thức group chưa được triển khai. Không dùng tài liệu này như chứng nhận pentest.

## Mục tiêu và giả định

Bảo vệ nội dung khi vận chuyển/lưu trữ; giới hạn API theo tài khoản/thành viên; giữ khả năng đọc lịch sử. Client và trình duyệt phải đáng tin. TLS bảo vệ đường tới server, không làm server mất quyền phát JavaScript. Các trường sender/chat/time v1 chưa được ký/AAD nên không kết luận toàn vẹn metadata từ GCM content.

Phân biệt: database chỉ bị đọc; dữ liệu/API bị sửa; server có toàn quyền thay JS. Baseline tin public key server. TOFU/signatures dự kiến giảm tấn công dữ liệu/API sau lần tin đầu, chưa bảo vệ tuyệt đối lần đầu hoặc client bị thay. Admin ứng dụng không đồng nghĩa SSH/root, nhưng root trên host có thể thay app và đọc metadata/secrets.

## Tình huống và ứng cứu dự kiến

| Sự cố | Phơi lộ/tác động | Phòng ngừa, phát hiện và hành động |
|---|---|---|
| Lộ source | Logic/giao thức; không nên có bí mật thật | Tìm secret trong lịch sử; rotate secret thực sự xuất hiện; không xem thuật toán công khai là lỗ hổng |
| Lộ .env | DB/session/provider credentials tùy cấu hình | Cô lập, rotate từng credential, hạn chế IAM/DB; rà truy cập trái phép; rebuild nếu bị ghi vào source |
| Lộ session secret | Có thể ảnh hưởng tính xác thực cookie; session còn phụ thuộc store | Thay secret, revoke toàn bộ session, yêu cầu login lại; kiểm tra store và log metadata |
| DB chỉ đọc | Email, metadata, hash password, ciphertext và backup v1 | Least privilege, TLS/backup encryption. Backup password v1 vẫn có nguy cơ đoán offline; vault recovery mạnh ở giai đoạn sau. Đánh giá/notify dữ liệu cá nhân |
| DB bị sửa | API quyền/roster/history/keys có thể sai | Cô lập ghi, snapshot phục vụ điều tra, đối chiếu log/backup; chữ ký/AAD v2 chỉ giúp sau triển khai; legacy metadata chưa được bảo vệ |
| Backup khóa bị lấy | Nguy cơ đoán password v1 hoặc mở nếu có mã recovery | Giữ backup ngoài host được mã hóa; không coi PIN6+KDF là đủ. Điều tra lộ mã trên endpoint |
| Tráo public key | Có thể dẫn đến mã hóa cho attacker | TOFU/key revision cảnh báo dự kiến; đối chiếu tùy chọn. Thu hồi khóa sau đánh giá, không tự sinh khóa làm mất lịch sử |
| Sửa API response | Bản mã, metadata hoặc thành viên có thể bị tráo | GCM đã phát hiện sửa ciphertext nếu khóa tin đúng; cache mới không hiện lại plaintext cũ; signatures/roster chain còn phải triển khai |
| Thay JavaScript | Có thể lấy nội dung trước mã hóa, sau giải mã hoặc gọi khóa local | E2EE web không bảo đảm trong tình huống này. Cô lập origin, dừng phục vụ mã nhiễm, rebuild từ nguồn sạch, rotate và cảnh báo người dùng |
| SSH/root bị chiếm | Toàn host, volumes và credentials bị ảnh hưởng | Chặn truy cập, giữ bằng chứng, revoke IAM/SSH/secrets; dựng host mới sạch, không chỉ xóa file lạ trên host cũ |
| Admin dashboard bị chiếm | Metadata/quản trị bị lạm dụng; chưa có dashboard ở phase1 | Backend RBAC/MFA/reauth và audit ở phase7; revoke phiên admin, kiểm tra actions, không cấp quyền decrypt content |
| Thành viên nhóm bị thêm trái phép | Có thể lấy CEK tương lai nếu client chấp nhận roster giả | Signed roster/version, owner/admin authority và race tests phải có trước phát hành group |
| Xóa/ransomware | Mất khả dụng và dữ liệu | Backup mã hóa ngoài EC2, retention/PITR, diễn tập restore sạch. Không hứa E2EE ngăn xóa dữ liệu |

## Chính sách vận hành đích

AWS IAM/DB least privilege, app DB user không root; SSH key/MFA, secrets ngoài image; chỉ proxy80/443 public, SSH chỉ IP quản trị, DB/Redis/app mạng riêng. Docker published ports có thể vượt UFW, phải kiểm tra thực tế và SG. Cloudflare/WAF/rate limit không thay thế dung lượng mạng hoặc chống mọi DDoS lớn. Các cấu hình phải trở thành file/tài liệu triển khai và được kiểm chứng ở phase8, chưa có triển khai cloud hiện tại.

Khi phát hiện sự cố: ghi thời điểm/phạm vi, cô lập, giữ snapshot/log không ghi secrets, revoke session/rotate credentials từ thiết bị sạch, rebuild, restore vào môi trường riêng, kiểm tra integrity/luồng chức năng, đối soát dữ liệu mới và thông báo người dùng theo nghĩa vụ. Chỉ mở lại sau kiểm tra; quản trị phải có kênh không tự khóa mất quyền truy cập.

## Tài liệu protocol

Xem E2EE_PROTOCOL.md, BACKUP_RECOVERY.md và DATABASE.md. Mỗi kiểm thử chỉ chứng minh hành vi đã thử; chưa có đánh giá mật mã độc lập của toàn ứng dụng.

## Delta Phase 2

Đã thêm CSRF token cho account/profile mutations mới; kiểm tra Origin và JSON/SameSite tiếp tục cho legacy Java/chat. CSP self-only/blob, frame/object restrictions, no-referrer, nosniff; generic internal errors chỉ log code/name để tránh SQL/PII lọt vào log. Durable account/IP throttling và challenge cooldown/attempts/consume transactions; OTP HMAC key ở SESSION_SECRET; production SMTP bắt TLS. Session auth_version/revocation kiểm tra ở mỗi authenticated request; old sessions cần login lại. Profile trả projection riêng, phone chỉ hiện nếu verified; DOB công khai chỉ ngày/tháng. Avatar giới hạn bytes/pixels/format, loại metadata.

Chưa có RBAC/admin/TOTP/Turnstile/adaptive challenge, Redis, end-to-end signed groups, independent recovery/PIN hay production reverse proxy/Cloudflare rules. Không suy ra các tính năng này đã hoàn tất vì có CSP hoặc bảng rate limit. E2EE legacy và web distribution threat model giữ nguyên giới hạn Phase 1.

## Delta Phase4–5

HPKE X25519/HKDF-SHA256/AES256GCM wrap CEK; Ed25519 signatures trên canonical manifest và roster chain. Backend kiểm tra actor, role transitions, exact recipient set, locked version và replay UUID. Client pin identity/head qua IndexedDB, từ chối key change/rollback đã biết, không fallback v1. Pin mất trên máy mới/xóa site data, không chứng minh first-contact identity hay chống mọi fork. Chưa có audit độc lập/ratchet/forward secrecy.

Binary attachments có reservation/quota serialize, stream bounds/hash/temp atomic/no-overwrite, storage ngoài web root, recipient-only downloads và plaintext metadata encrypted. Safe preview kiểm tra magic/dimensions rồi bitmap/canvas; không embed SVG/HTML/PDF. Server không giải mã/scan malware plaintext, không thể thu hồi plaintext/CEK người nhận đã giữ. Block riêng không tự rời nhóm; UI nói rõ. Clock hiển thị vẫn là metadata server chưa ký.

Signing vault là encrypted Ed25519 PKCS8 bằng HKDF domain-separated từ X25519 private PKCS8. Cùng private X25519 cũ có thể mở vault trên máy mới; server/auth account không tự nhận private signing key plaintext. Lộ X25519 key có thể lộ cả lịch sử wraps và vault; reset login không tự phục hồi X25519. Không gọi đây là hoàn thành PIN/recovery key.

Quota chỉ trả sau cancel/cleanup xóa file thực; cần chạy cleanup định kỳ và backup database+file cùng mốc. Chưa triển khai public AWS/S3/HTTPS/Redis/Turnstile/Admin, không suy ra chống DDoS hay server-root compromise chỉ vì có các kiểm tra này.
