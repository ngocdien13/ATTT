# Phase 4–5: nhóm E2EE và file mã hóa

Bản này nối tiếp Phase 2 + UI, giữ nguyên chat cá nhân/Java cũ. Các tính năng nhóm và file dùng giao thức v2 riêng. Không cần so fingerprint thủ công để bắt đầu: client tin khóa lần đầu và lưu pin trên thiết bị (TOFU). Đây chưa phải Key Transparency và không phát hiện được mọi tráo khóa ngay lần gặp đầu.

## 1. Cập nhật từ bản đang dùng

**Trên máy chạy Node:** Ctrl+C để dừng server. Giữ database, `server/.env`, dữ liệu trình duyệt/IndexedDB và mật khẩu backup cũ. Sao lưu database như hướng dẫn Phase 2. Nếu đã chạy bản nhóm/file này thì phải sao lưu thêm thư mục ciphertext ở bước 6.

Giải nén source mới vào thư mục riêng, chép `.env` cũ sang `ATTT/server/.env`. Không chép `node_modules` cũ. Không chạy lại `schema.sql` vào database đã có dữ liệu; không xóa migration ledger hoặc sửa file migration đã applied.

**Windows PowerShell — backend:**

```powershell
cd D:\ATTT-phase4-5\ATTT\server
npm ci
npm run build:v2
npm run migrate -- status
npm run migrate -- up
npm run migrate -- check
npm start
```

**Ubuntu Terminal — backend:**

```bash
cd /duong-dan/ATTT/server
npm ci
npm run build:v2
npm run migrate -- status
npm run migrate -- up
npm run migrate -- check
npm start
```

Node24/MySQL8 như Phase 2. Hai migration thêm là `003_groups` và `004_attachments`; tất cả001–004 phải applied. Build v2 tạo bundle thư viện mật mã ngay tại client, không dùng CDN. Bundle đã có sẵn trong archive; nếu production cài `npm ci --omit=dev` thì dùng bundle đã build, không cần esbuild ở runtime.

**Trình duyệt trên cùng máy:** http://localhost:3000 → tải lại trang và đăng nhập. Máy khác vẫn cần HTTPS cho Web Crypto. Không mở thêm cổng upload hoặc cổng database để thử nhóm/file.

## 2. Chuẩn bị các tài khoản

Mỗi người cần đăng nhập bằng **bản mới ít nhất một lần**, mở được khóa X25519 cũ. Client tạo khóa ký Ed25519 ngẫu nhiên và lưu bản sao mã hóa bằng khóa dẫn xuất từ private key X25519 cũ. Public identity v2 không được thay tự động. Máy mới khôi phục khóa ký đó bằng chính khóa chat cũ, không sinh identity thay thế.

Trong tab Nhóm sẽ có trạng thái **Nhóm/file E2EE sẵn sàng**. Nếu bị khóa backup, mở lại backup trong Hồ sơ & cài đặt bằng mật khẩu cũ hoặc thiết bị còn khóa như Phase 2. Reset password không tự giải mã backup cũ; Phase 6 recovery độc lập/PIN chưa triển khai.

Người mời và người nhận phải là bạn đã chấp nhận; lời mời bị từ chối khi đang block hoặc chưa kết bạn. Chưa đăng ký identity v2 thì không nhận được lời mời/file v2 — hãy đăng nhập bản mới trước.

## 3. Tạo và quản lý nhóm

**Client A:** tab **Nhóm** → **Tạo nhóm** → nhập tên/mô tả → Tạo. Ban đầu chỉ có A là owner.

**Client A:** **Quản lý nhóm** → tìm handle của B → **Gửi lời mời nhóm**.

**Client B:** tab **Nhóm** → lời mời → **Tham gia** hoặc **Từ chối**. Lời mời có chữ ký người mời; khi chấp nhận, B ký việc thêm chính mình. Sau khi tham gia, B có thể gửi/đọc tin mới, không được cấp lại khóa tin trước đó.

Lặp lại với C để thử ba người. Tin nhắn tiếng Việt/emoji được mã hóa một lần, CEK được HPKE-wrap cho tất cả thành viên hiện tại, gồm cả người gửi. Có bảng emoji nhóm và Ctrl+Enter để gửi. Lịch sử mỗi trang50 tin, **Tải tin cũ hơn** để đọc tiếp.

Trong Quản lý nhóm:

- Owner/admin sửa tên/mô tả và ảnh nhóm. Ảnh PNG/JPEG/WebP tĩnh≤2MB, server reencode WebP256×256; **ảnh nhóm và tên/mô tả là metadata không E2EE**. Hash ảnh được ký trong phiên bản nhóm.
- Owner cấp/hạ admin, chuyển quyền owner. Nhóm luôn có đúng1 owner.
- Owner xóa admin/member khác; admin chỉ xóa member. Không được xóa owner.
- Member/admin tự rời nhóm. Owner phải chuyển quyền trước khi rời.
- Người rời vẫn đọc/tải những tin/file từng được gửi khóa cho họ, không có khóa tin/file mới. Không thể thu hồi plaintext/CEK họ đã lưu hoặc ngăn thành viên hiện tại chia sẻ lại.
- Block1–1 không tự xóa một trong hai khỏi nhóm chung. Trong nhóm vẫn thấy tin của nhau; muốn ngừng tương tác thì rời nhóm hoặc nhờ quản trị viên xóa thành viên. UI có ghi rõ chính sách này.

Mọi thay đổi roster/tên/ảnh/role tăng version và có chữ ký, nối với hash trước. Gửi khi nhóm thay đổi trả409, giữ draft; tải lại trạng thái và gửi lại. Không tự động gửi bản mã cũ sang roster mới.

## 4. Gửi và nhận file

Trong chat nhóm hoặc chat cá nhân, chọn nút **＋** → chọn file → xác nhận gửi. Client kiểm tra loại/dung lượng, mã hóa nội dung và tên/MIME, giữ quota, upload ciphertext dạng binary, rồi công bố envelope đã ký. Có tiến trình upload/download. Lỗi mạng báo thất bại; chọn file lại để thử mới. Chưa có resume theo chunk; không âm thầm hiển thị đã gửi nếu publish chưa thành công.

Người nhận bấm **Tải về**: tải ciphertext → kiểm tra chữ ký/wrap/hash/GCM → giải mã tại client → lưu file. **Xem ảnh** chỉ cho dữ liệu PNG/JPEG/WebP có header/kích thước phù hợp, sau đó decode và vẽ lại qua canvas thành bitmap. SVG/HTML giả tên ảnh bị từ chối preview. PDF/TXT/DOCX chỉ tải xuống, không nhúng nội dung chủ động vào origin ứng dụng.

Mặc định:

```dotenv
# Để trống: ATTT/.data/encrypted-files, nằm ngoài client/public
ATTACHMENT_DIR=
MAX_FILE_BYTES=10485760
FILE_USER_QUOTA_BYTES=104857600
FILE_GLOBAL_QUOTA_BYTES=1073741824
FILE_ALLOWED_EXTENSIONS=jpg,jpeg,png,webp,pdf,txt,docx
```

10MB là giới hạn plaintext, ciphertext thêm16byte GCM tag. Có thể cấu hình tới50MB; browser vẫn mã hóa cả file trong bộ nhớ, không phải streaming AEAD/chunk resume. Quota mặc định100MB/uploader và1GB toàn kho; bao gồm reservation và file chưa công bố tới khi cleanup thực sự xóa. Người nhận không bị tính lại quota cho cùng bản mã.

Server không biết tên/MIME gốc và không thể quét malware plaintext trong file E2EE. Kiểm tra extension ở client là UX/policy, không phải bằng chứng loại file/malware trên server. Server vẫn thấy số byte, hash ciphertext, người gửi, nhóm/đối tượng nhận, thời điểm và loại envelope file.

## 5. Vị trí và bảo trì kho file

Ciphertext mặc định ở **ATTT/.data/encrypted-files**. Không đặt ATTACHMENT_DIR bên trong `client`. Thư mục/filename do server quản lý, dùng UUID opaque và đuôi.bin; không dùng filename của người gửi để tạo đường dẫn. Server chỉ phát binary download qua route có xác thực/quyền recipient, không phục vụ tĩnh kho này. Local adapter có interface để viết S3 adapter sau; **chưa tích hợp S3 thật**.

Nếu muốn thư mục riêng trên Ubuntu, tạo/chown cho đúng user chạy Node và đặt đường dẫn tuyệt đối trong `.env`. Windows có thể dùng `ATTACHMENT_DIR=D:/seruchat-data/ciphertext`. Restart sau khi sửa cấu hình. Khi chuyển thư mục phải di chuyển toàn bộ ciphertext cũ lúc Node đã dừng; đổi biến môi trường một mình sẽ làm file cũ không tìm thấy.

**Backend terminal, chạy hằng ngày:**

```sh
npm run cleanup
```

Dọn reservation/ciphertext chưa attach đã hết hạn hơn1giờ, temp upload>25giờ, avatar không còn dùng ở head nhóm>1ngày; giới hạn1000 reservation/lượt. Không xóa file đã attach hoặc tin/keys. Pending upload hết hạn sau24giờ, quota chỉ được trả khi hủy/cleanup xóa thực tế. Chưa tự cài cron lên máy bạn.

## 6. Backup, restart và rollback

Database chứa envelopes/recipients/quyền truy cập/storage_key; thư mục ciphertext chứa file.bin. **Phải sao lưu và khôi phục cả hai cùng một mốc**, không chỉ dump MySQL. Dừng Node trong lúc tạo backup nhất quán; MySQL vẫn chạy để dump. Giữ `.env` riêng an toàn, không đưa secrets vào source hoặc gửi lên chat.

**Ubuntu, ví dụ khi giữ đường dẫn mặc định (Node đã dừng):**

```bash
cd /duong-dan/ATTT
mkdir -p /noi-luu-backup/seruchat
mysqldump -u YOUR_DB_USER -p --single-transaction --hex-blob --result-file=/noi-luu-backup/seruchat/database.sql seruchat
tar -czf /noi-luu-backup/seruchat/ciphertext.tar.gz -C .data encrypted-files
```

Nếu ATTACHMENT_DIR khác thì archive đúng thư mục thực tế. Bảo vệ/mã hóa backup bằng công cụ và nơi lưu của bạn; đoạn lệnh này chưa tự mã hóa backup. Cần backup ngoài máy chủ và thử restore trước khi production. Giữ MySQL, ciphertext, `.env` và IndexedDB thì restart Node không tự làm đổi khóa hay xóa file; Docker volume/restart test thuộc Phase8 chưa thực hiện.

Rollback source về Phase2: giữ database, kho ciphertext và **thư mục database/migrations001–004** để ledger không thiếu file. Bản cũ vẫn đọc chat1–1 nhưng không có UI nhóm/file. Không DROP bảng mới để rollback. Restore database cũ phải dùng backup ciphertext tương ứng, thử ở database/thư mục riêng trước; tránh trộn snapshot khiến file thiếu hoặc không được thống kê quota.

## 7. Kiểm thử và giới hạn

Xem PHASE4_5_DELIVERY.md và TESTING.md. Đã chạy HTTP/MySQL/filesystem thật, WebCrypto/HPKE/Ed25519, trình duyệt và Java. Không dùng mock API production; không deploy AWS, không có app Admin hoặc recovery độc lập/PIN trong bản này.

Giới hạn hiện tại: tối đa50 thành viên/nhóm,1000 sự kiện roster/metadata, danh sách200 nhóm, lời mời100 dòng; lịch sử tin vẫn phân trang50. Poll nhóm4giây, chưa WebSocket/checkpoint/gossip chống fork đa thiết bị. TOFU phát hiện thay đổi so với pin của thiết bị; không xác minh danh tính con người lần đầu, không chống hoàn toàn server phân phối JavaScript độc hại. Giao thức ứng dụng mới chưa được audit mật mã độc lập và không có forward secrecy/ratchet trước lộ static recipient private key.

Owner là thành viên cuối cùng chưa có thao tác đóng/xóa nhóm trong bản này; giữ nhóm hoặc mời/chuyển owner trước khi rời. Tên hiển thị thành viên lấy từ profile server, còn ID và khóa nằm trong signed roster. Timestamp hiển thị là metadata server, không phải bằng chứng thời gian có chữ ký.
