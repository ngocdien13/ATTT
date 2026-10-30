# Docker / AWS và phục hồi

## Phạm vi nghiệm thu

Repo cung cấp cấu hình và công cụ. Chưa có EC2, domain/ACME, tài khoản cloud hay credentials nhà cung cấp được triển khai trong phiên này. Docker daemon không có trong môi trường nghiệm thu nên chưa build/run Compose. Các bước dưới đây cần chạy và nghiệm thu trên máy triển khai trước khi công khai. Không coi tài liệu này là bằng chứng hệ thống đã online.

## Phương án một EC2 cho bài tập

Dùng Ubuntu LTS 64-bit x86, dung lượng đĩa đủ cho MySQL/tệp/backup và tối thiểu 4GB RAM để có khoảng trống cho giới hạn container trong Compose. Chọn cấu hình theo tải thực tế, kiểm tra giá hiện hành trong tài khoản; không mặc định mọi tài nguyên miễn phí. Bật cảnh báo ngân sách trước khi tạo.

1. Tạo EC2 với EBS mã hóa, cập nhật hệ điều hành; dùng key SSH riêng hoặc Session Manager. Security Group mở 80/443 cho web; SSH22 chỉ IP quản trị (hoặc đóng nếu dùng Session Manager). **Không mở 3000/3306**. Bật IMDSv2 bắt buộc; không đặt AWS access key dài hạn vào source hoặc `.env`.
2. Trỏ DNS A của domain riêng tới IPv4 công khai ổn định của máy. Nếu thêm AAAA thì phải cấu hình IPv6 tương ứng. Cổng80/443 phải tới được Caddy để cấp/chạy HTTPS.
3. Cài Docker Engine + Compose plugin theo tài liệu chính thức; cài Node.js 24 trên host cho công cụ secrets/backup. Chép source vào thư mục riêng của tài khoản triển khai.
4. Tạo cấu hình (chạy ở gốc repo):

```bash
node deploy/init-secrets.js
cp deploy/compose.env.example .env
cp deploy/app.env.example deploy/app.env
```

Sửa `.env`: `DOMAIN` thành domain thật và `ACME_EMAIL` thành email quản trị. Sửa `deploy/app.env`: `PUBLIC_ORIGIN=https://DOMAIN`, SMTP thật để xác minh email và Turnstile nếu dùng. Không chép `server/.env` local chứa DB_HOST=localhost vào image.

`init-secrets.js` tạo bốn bí mật độc lập trong thư mục private `deploy/secrets`, không ghi đè file cũ. Sao lưu riêng **recovery_master_key** trước khi phục vụ người dùng. Các file được mount riêng chỉ đọc cho container; Compose secrets trên một host là file mount, không phải dịch vụ HSM/Secrets Manager.

Nếu muốn dùng AWS Secrets Manager, người vận hành cấu hình EC2 instance role chỉ đọc đúng secret ARN, dùng triển khai ngoài app để xuất file tạm private rồi mount vào container. Repo **chưa tích hợp SDK tự lấy secret, KMS envelope encryption hay tự xoay master key**. Không tự thay RECOVERY_MASTER_KEY đang dùng: phải có migration re-encrypt gate/OTP/audit được thiết kế riêng.

5. Khởi động và xem trạng thái:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app proxy
curl --fail https://DOMAIN/health/ready
```

Thay DOMAIN trong lệnh bằng domain thật. MySQL tự tạo duy nhất DB `seruchat`; app tự chuẩn bị schema/migrations. Chỉ proxy publish80/443. App chạy user không phải root, filesystem chỉ đọc, bỏ capabilities; `/tmp` và volume ciphertext là vùng ghi cần thiết. DB ở mạng Docker nội bộ, không publish port.

6. Đăng ký tài khoản quản trị như người dùng bình thường, xác minh email rồi cấp quyền trên host:

```bash
docker compose exec app node server/tools/admin.js grant email@example.com admin
```

Đăng nhập lại `/admin`, thiết lập TOTP, kiểm tra stats/users/reports/audit. Reset MFA hoặc thu hồi quyền cần CLI tại host; không có tài khoản mặc định.

7. Nghiệm thu trước khi mở cho nhóm học: hai tài khoản thật, email, PIN thiết bị mới, nhắn riêng/nhóm/tệp, permissions, read/unread, khóa tài khoản/thu hồi phiên, lỗi OTP, giới hạn file và healthcheck. Đảm bảo DevTools không có lỗi CSP/mixed content, cookie Secure, không có debug tracing. Docker `logs` không chứa body/PIN/token/private key.

SMTP mặc định cần cấu hình STARTTLS phù hợp. Turnstile: tạo widget Managed cho đúng domain, đặt đủ `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET`, giữ secret kín; restart app và thử luồng thật. Khi bật, đăng nhập/đăng ký/gửi email/reset yêu cầu token hợp lệ; không có nhánh tự bỏ qua khi Cloudflare lỗi. SMS optional qua Twilio cần credentials/số gửi hợp lệ và kiểm tra chính sách nhà cung cấp.

## Backup mã hóa nhất quán

Backup cần **DB + ciphertext + đúng master key**. Chỉ dump DB sẽ không có bytes tệp; chỉ giữ source không có dữ liệu. Công cụ không lấy `.env`/master key vào cùng bundle; lưu các bí mật và mã khôi phục người dùng riêng.

Tạo khóa backup độc lập 32 byte ngẫu nhiên dạng hex, cất trong file private **ngoài repo và ngoài nơi chứa backup**. Có thể tạo bằng Node, ghi thẳng file thay vì in khóa ra terminal:

```bash
node -e "require('fs').writeFileSync('/duong-dan-private/backup-key',require('crypto').randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'})"
BACKUP_KEY_FILE=/duong-dan-private/backup-key bash deploy/backup.sh /duong-dan-backup
```

Thay các đường dẫn mẫu bằng thư mục đã tạo trên host. Script tạm dừng app để ngăn ghi, dump DB và nén ciphertext, mã hóa AES-256-GCM rồi khởi động lại nếu app trước đó đang chạy. Có gián đoạn ngắn. Dùng ổ đĩa mã hóa/temporary directory private vì lúc tạo bundle có bản dump tạm rõ chứa metadata/backup keys đã mã hóa. Script xóa temporary files khi xong; xóa file không bảo đảm secure erase trên SSD.

Bundle `.scbackup` được bảo vệ bằng khóa riêng, IV ngẫu nhiên và AAD phiên bản. Không ghi đè output. Sai khóa/sửa bytes sẽ không công bố file giải mã cuối cùng. Đã test round-trip/tamper/wrong key của phần mã hóa; **chưa chạy script Docker backup hoặc diễn tập phục hồi toàn bộ trên AWS**.

Đẩy bundle đã mã hóa tới vùng lưu trữ private ngoài EC2 (ví dụ S3 private/versioning, IAM tối thiểu). Repo không tự tạo bucket/upload/schedule. Giữ nhiều mốc, theo dõi lần backup cuối và định kỳ restore thử ở môi trường cách ly.

## Khôi phục — chỉ vào môi trường trống/cách ly

Không import đè database đang phục vụ. Quy trình này tạo **một DB ứng dụng** trên host phục hồi riêng; không tạo thêm DB vận hành trên máy local của bạn.

1. Chuẩn bị source đúng phiên bản, secrets/cấu hình đã cất riêng. Khôi phục đúng `recovery_master_key`; không chạy tạo khóa mới thay thế. Có thể dùng SESSION_SECRET mới để vô hiệu các phiên cũ, nhưng DB password phải khớp secrets trên host phục hồi.
2. Giải mã bundle vào thư mục private, rồi xem manifest:

```bash
BACKUP_KEY_FILE=/private/backup-key node deploy/backup-crypt.js decrypt /backup/moc.scbackup /private/bundle.tar.gz
tar -tzf /private/bundle.tar.gz
tar -xzf /private/bundle.tar.gz -C /private/restore
```

Chỉ giải nén bundle do bạn quản lý và đã xác thực; tạo `/private/restore` trước. Giải mã xong mới giải nén, không stream plaintext chưa xác thực thẳng vào MySQL.

3. Chạy DB trước; import vào DB trống vừa tạo:

```bash
docker compose up -d db
docker compose exec -T db sh -c 'MYSQL_PWD="$(cat /run/secrets/db_root_password)" exec mysql -uroot seruchat' < /private/restore/database.sql
```

4. Khi app đang dừng, nạp lại ciphertext vào volume bằng cùng image đã build. Bản archive chỉ chứa các `.bin`/tạm thuộc kho, kiểm tra nội dung trước; không nạp archive lạ. Ví dụ:

```bash
docker compose build app
docker compose run --rm --no-deps -T --entrypoint tar app -C /app/.data/encrypted-files -xzf - < /private/restore/ciphertext.tar.gz
docker compose up -d app proxy
```

5. Kiểm tra `/health/ready`, đối chiếu số người/tin/tệp với manifest ghi nhận riêng, dùng tài khoản thử khôi phục PIN/mã và tải tệp cũ. Đóng quyền mạng thử nghiệm sau diễn tập. Xóa các bản dump giải mã khi hoàn tất.

## Theo dõi và sự cố

Health endpoints: `/health/live` chỉ process HTTP; `/health/ready` kiểm DB và migrations, chưa kiểm SMTP/Turnstile hay dung lượng đĩa. Cần cấu hình giám sát ngoài cho HTTPS, 5xx/429, disk/MySQL, CPU/RAM, thời gian backup, chứng chỉ và sự kiện quản trị. Compose giới hạn tài nguyên không thay thế chống DDoS; WAF/CloudWatch/GuardDuty/alert routing chưa được tự tạo.

Nếu nghi server bị kiểm soát: cách ly ingress/tạm dừng phục vụ web, giữ snapshot/log làm chứng cứ, thu hồi quyền IAM/credentials nghi lộ, dựng host sạch từ source kiểm chứng và bản dữ liệu phù hợp. Đổi SESSION_SECRET, thu hồi account_sessions, reset MFA/SMTP/Turnstile theo mức lộ. **Không tự xoay master key** làm mất khả năng mở vault; cần kế hoạch rewrap/reencrypt riêng. Nếu private key client bị lộ qua JavaScript độc hại, đổi mật khẩu/PIN không thay thế được đổi danh tính và xử lý lịch sử đã lộ; bản hiện tại cố định danh tính nên cần quy trình nâng cấp riêng trước khi tiếp tục phục vụ.

Audit có HMAC-chain nhưng chưa có neo ngoài; có thể dùng CLI `verify-audit`, cất kết quả số hàng/hash cuối cùng riêng và so sánh khi điều tra. Không khẳng định chuỗi audit chống được kẻ đã nắm cả master key/server hoặc rollback toàn DB.

## Tài liệu chính thức

- [AWS Security Group rules](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html)
- [AWS Secrets Manager best practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [Docker Engine Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Compose services](https://docs.docker.com/reference/compose-file/services/)
- [Cloudflare server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
