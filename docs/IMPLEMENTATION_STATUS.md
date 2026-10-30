# Tiến độ hiện tại

Bản Telegram + Phase 6–8 tiếp nối UI/PIN. README là hướng dẫn chạy hiện hành. Các file PHASE1/2/4_5 ghi nhận lịch sử, không phải hướng dẫn chạy mới.

| Phần | Đã triển khai | Giới hạn còn lại |
|---|---|---|
| Tài khoản | Hồ sơ, avatar, privacy, email/SĐT, mật khẩu, quản lý phiên, bạn bè/chặn | Email/SMS Internet phụ thuộc cấu hình nhà cung cấp, chưa nghiệm thu gửi thật |
| UI | Danh sách chat/nhóm chung, tìm/lọc, menu, ghim/lưu trữ/mute/unread, sáng/tối/mobile, thông tin/ảnh/tệp/link từ lịch sử tải | Phong cách Telegram Web, không sao chép toàn bộ Telegram; chưa push khi đóng trang |
| Tin nhắn | Tin mới 1–1/nhóm dùng v2 mã hóa + chữ ký tự kiểm tra; reply/edit/recall/reaction/pin bằng sự kiện mã hóa và ký | Thu hồi không hủy bản sao; thao tác yêu cầu tải tới tin gốc; lịch sử cũ v1 không có chữ ký |
| Nhóm/tệp | Mời/tham gia, phân quyền, đổi tên/avatar, chuyển chủ, loại thành viên; tệp binary mã hóa/giới hạn/quota/download/preview | Chưa resumable upload/S3 adapter/ratchet |
| Phase 6 | PIN độc lập, recovery code, chờ tăng dần, khôi phục thiết bị mới, đổi PIN giữ khóa; trạng thái prepare mã hóa trước khi lưu session | Chưa phê duyệt thiết bị qua push, PAKE/HSM, key transparency |
| Phase 7 | Admin RBAC/TOTP, stats/users/suspend/reports/audit; mật khẩu lại cho thao tác khóa; CSRF, rate limit, CSP; tích hợp Turnstile có kiểm tra server/replay | Chưa SIEM/DDoS/WAF tự động, chưa CAPTCHA production thật. Audit chưa có điểm neo ngoài server |
| Phase 8 | Dockerfile, Compose MySQL/app/Caddy, secrets files, HTTPS cấu hình, healthcheck, backup mã hóa và runbook EC2/incident | Chưa build/chạy Docker/EC2/ACME/SMTP production hoặc diễn tập phục hồi toàn bộ ở AWS |
| Database | Một DB `seruchat`, một schema nền và migrations tự động 001–006 | Không xóa DB cũ khác trên máy; không sửa migrations đã áp dụng |

Xem [TELEGRAM_PHASE6_8.md](TELEGRAM_PHASE6_8.md), [DEPLOY_AWS.md](DEPLOY_AWS.md), [SECURITY_MODEL.md](SECURITY_MODEL.md).
