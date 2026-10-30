# Dùng gói Phase 1 trên Windows

Đây là nền tảng nâng cấp của repo ATTT, chưa có giao diện Snapchat, group/file v2 hoặc Admin/PIN mới. Những phần đó được giữ nguyên trong kế hoạch, xem IMPLEMENTATION_STATUS.md.

## Đang có dữ liệu

1. Dừng server bằng Ctrl+C. Sao lưu thư mục hiện có và export database bằng Workbench. Giữ nguyên profile trình duyệt/IndexedDB và thư mục encryption/keys.
2. Giải nén ATTT-phase1.zip. Thư mục ATTT chứa code đầy đủ; copy code vào thư mục dự án đang dùng. Gói không chứa .env thật/node_modules/keys để ghi đè dữ liệu riêng.
3. Mở PowerShell tại server, giữ DB_NAME/DB_* của .env hiện có:

```powershell
npm.cmd ci
npm.cmd run migrate -- status
npm.cmd run migrate -- up
npm.cmd run migrate -- check
$env:DEBUG_API = '1'
npm.cmd start
```

4. Mở http://localhost:3000, Ctrl+F5, đăng nhập bằng tài khoản cũ. Giao diện/luồng 1–1 vẫn là bản repo gốc. Không tạo lại khóa để thử sửa lỗi.
5. Nếu migration báo lỗi, dừng và đọc DATABASE.md. Không chạy lại schema tạo mới hoặc xóa bảng.

## Máy mới

Cài Node24/MySQL8; chạy database/seruchat_full.sql cho database chưa có bảng. Trong server, copy .env.example thành .env, điền DB_NAME=seruchat_full, kết nối và session secret ngẫu nhiên. Sau đó chạy npm ci → migrate up → migrate check → npm start như trên. Không áp dụng bước tạo schema cho DB đang có dữ liệu.

## Nếu dùng Git

Patch đi kèm chỉ dành cho baseline 7f2894fcceb1b960e47613b561eac200b78cb58b. Giữ công việc hiện có trên nhánh/bản sao riêng. Từ repo sạch đúng baseline, tạo nhánh mới rồi git apply --check trước git apply. Không dùng reset --hard hoặc force push để vượt lỗi patch. Nhánh đang làm ở môi trường bàn giao là upgrade/phase-1-foundation; chưa được push lên GitHub.

## Kiểm chứng

GET /health/live: alive. GET /health/ready: ready sau khi migration đạt; pending/lỗi trả503. Chạy npm test với RUN_MYSQL_TESTS=1 để kiểm tra cả DB, theo TESTING.md. Không được coi việc unit test không chạy DB là xác nhận migration đã đạt.
