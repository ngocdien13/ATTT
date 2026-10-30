# E2E legacy thật

Xem ../../TESTING.md. npm ci, npx playwright install chromium, JDK21/java/javac trên PATH, MySQL test có quyền CREATE/DROP rồi npm test.

Không chạy với credential production. Bài test tự tạo database ngẫu nhiên, không dùng DB_NAME ứng dụng; teardown xóa database test. Các key/password phát sinh chỉ là fixture tạm, không phải tài khoản mẫu cho ứng dụng.

### Giao diện theo ảnh tham chiếu

`npm run test:ui` chạy `reference-ui.cjs` trên MySQL riêng tên ngẫu nhiên. Tạo dữ liệu thử nghiệm, kiểm tra viewport 2048×1009 và 390×844, asset font/nền cục bộ, menu 7 dòng, xem nhanh, tab mới, profile/settings, ghim/lưu trữ, DOM ổn định qua polling và chuyển tài khoản có xác thực. Nếu đặt `E2E_UI_SCREEN_DIR` thì lưu screenshot nội bộ vào thư mục đó. Các screenshot thử nghiệm không được đưa vào ZIP source.
