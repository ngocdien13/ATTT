# Bàn giao tài khoản/profile và UI nền

## File và database

- `database/migrations/002_accounts.js`: bổ sung trạng thái email/auth_version/terms trên users; bảng account_sessions (hash SID), account_challenges (HMAC token/OTP), account_rate_limits và profile_avatars. Không chuyển đổi key/message ciphertext.
- `server/src/services/validation.js`: validator email, giữ Gmail alias, libphonenumber-js/max, DOB/min age/handle/password. Display name có thể trùng, handle không trùng; ID bất biến. Không giả lập đăng nhập Google.
- `server/src/controllers/authController.js`: đăng ký atomic, Argon2id, login rotate SID, SMTP challenge/reset, SMS challenge, change password + backup transaction, sessions.
- `profileController.js`: own/public projection, tìm prefix handle có giới hạn, sửa hồ sơ, privacy, ảnh tối đa 2 MB/16M pixels, chỉ ảnh tĩnh PNG/JPEG/WebP, reencode WebP 256×256 bỏ metadata, binary trong MySQL. Avatar không E2EE, không giữ filename/path do client gửi.
- `services/accountSecurity.js`, `delivery.js`, `middleware/auth.js`, `csrf.js`, `server.js`, `config/database.js`: durable throttle, delivery timeout/TLS, revoke tại mỗi request, CSRF, CSP/Origin/JSON checks, UTC MySQL session để tránh token hết hạn sai ở server khác múi giờ.
- `client/index.html`, CSS, `account.js`, `theme.js`, `app.js`, `terms.html`: UI hoạt động, không mock API, không tải font/script bên thứ ba. Terms là bản minh bạch cho dự án học tập, cần người vận hành bổ sung trước khi công khai.
- `messageController.js`: thêm API history pages riêng, không đổi legacy arrays hoặc mật mã.
- `server/tools/cleanup.js`, `.env.example`, tests/locks/e2e và tài liệu cập nhật.

## API mới

Danh sách và payload ở `../API.md`. Bắt buộc đăng nhập cho profile, search, avatar, session và phone. Các account/profile write mới bắt X-CSRF-Token từ GET `/api/auth/csrf`. Origin cùng host/protocol, JSON content type với request JSON. Avatar dùng binary Content-Type thực, tối đa 2 MB. Các endpoint auth public không đòi token phiên nhưng vẫn kiểm tra Origin/content type, rate và challenge secret.

Đăng ký API mới bắt buộc handle, displayName (hoặc username compatibility label), DOB, acceptTerms=true và password 12–128 ký tự. Client cũ chỉ gửi username/email/password cần nâng cấp request; **không tuyên bố register API cũ hoàn toàn không đổi**. Login/chat/key/Java protocol và history array cũ được giữ. Phiên tạo trước Phase 2 bị từ chối một lần, cần login lại. Chưa có API đổi email; xác minh email gắn với địa chỉ đăng ký hiện tại.

## Bảo mật và giới hạn

- Ownership profile/session enforced theo session; không dùng userId client cung cấp để chọn chủ tài khoản.
- Email/reset token entropy 256 bit, chỉ HMAC lưu DB; OTP SMS 6 số có server-side secret HMAC, bound challenge+user+phone, max5 thử/10 phút. Resend tối thiểu60 giây; quota tài khoản/IP. OTP này xác minh điện thoại online, **không phải PIN mã hóa backup offline**.
- Durable fixed-window account/IP throttle vẫn có burst ở ranh giới window; cooldown challenge có thêm kiểm tra timestamp thực. Chưa có adaptive Turnstile, Redis hoặc chống DDoS đầy đủ. Tấn công phân tán/targeted throttling vẫn có thể gây gián đoạn tạm thời.
- Email request/reset trả nội dung chung cả khi tài khoản không tồn tại/cooldown/provider fail. Không coi đây là cam kết chống mọi side channel thời gian.
- Đổi mật khẩu yêu cầu mật khẩu hiện tại và rewrap đúng public identity; transaction không thể chứng minh client độc hại thực sự mã hóa đúng plaintext key. UI chính chủ kiểm tra cặp khóa; không cho thay public key. Reset giữ nguyên backup cũ, không thể giúp người mất mọi khóa giải mã lịch sử.
- CSRF token mới áp dụng account/profile nhạy cảm; legacy chat/key/Java vẫn dùng Origin + JSON/SameSite, chưa chuyển tất cả sang CSRF token.
- Thông tin hồ sơ/metadata/avatar không E2EE. Dữ liệu tin nhắn legacy vẫn có giới hạn xác thực khóa/forward secrecy như Phase 1; chưa thêm Ed25519 hay signed roster bằng việc nâng cấp UI.
- CSP chỉ tài nguyên self/blob, không inline script. Khi thêm Turnstile ở Phase 7 phải điều chỉnh CSP theo provider, không tắt toàn bộ policy.
- Thử nghiệm thực tế của chủ dự án còn cần: email Internet thật, SMS VN thật, Safari/Firefox/a11y assistive tech, HTTPS hai mạng, proxy/production. Không có credentials/AWS/domain trong môi trường bàn giao.

## Kiểm thử

Kết quả chỉ ghi sau khi chạy; log cuối ở `verification/phase2-tests.log`, `verification/phase2-e2e.log`, `verification/phase2-audit.json`. SMTP là server thật cục bộ nhận thư qua TCP, không phải gửi thư ra Internet. SMS transport dùng mock trong unit test; OTP rules dùng MySQL/HTTP thật, không tính là SMS thật. Browser dùng Chromium/Playwright, Web Crypto, MySQL và Java thật; chỉ tắt sandbox trình duyệt trong container kiểm thử root, không tắt web security. Screenshot chỉ dùng QA nội bộ, không đưa vào archive.
