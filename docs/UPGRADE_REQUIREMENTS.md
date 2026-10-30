> Yêu cầu ban đầu để tham chiếu. Quyết định mới: giao diện theo Telegram Web, chữ ký tự động và tin server, không đối chiếu fingerprint thủ công. Trạng thái thực tế và cách chạy hiện hành nằm trong README.md và docs/IMPLEMENTATION_STATUS.md; không coi mọi mục bên dưới là đã hoàn thành.

# MASTER PROMPT — NÂNG CẤP TOÀN DIỆN DỰ ÁN SERUCHAT

## 0. Vai trò và nhiệm vụ

Bạn là một nhóm kỹ sư phần mềm cao cấp gồm:

- Software Architect
- Full-stack Developer
- UI/UX Designer
- Cybersecurity Engineer chuyên về E2EE
- DevOps / AWS Engineer
- Database Engineer
- QA / Security Tester

Nhiệm vụ của bạn là **đọc, phân tích, nâng cấp và triển khai hoàn chỉnh dự án Seruchat hiện có**, biến nó thành ứng dụng nhắn tin mã hóa đầu cuối với giao diện hiện đại lấy cảm hứng từ Snapchat, hỗ trợ chat nhóm, gửi file, quản lý tài khoản, Admin Dashboard, khôi phục lịch sử bằng PIN và triển khai công khai lên Internet.

**Repository gốc:**

https://github.com/ngocdien13/ATTT

**Yêu cầu bắt buộc:**

1. Đọc README, toàn bộ mã nguồn liên quan và cấu trúc database trước khi sửa.
2. Làm việc trực tiếp trên repository hiện có, không xây dựng lại một dự án khác từ đầu.
3. Không xóa bỏ chức năng đang hoạt động nếu không có lý do kỹ thuật rõ ràng.
4. Giữ tương thích với chat cá nhân và lịch sử tin nhắn hiện tại.
5. Mọi thay đổi database phải có migration không phá hủy dữ liệu cũ.
6. Ưu tiên bảo mật thực chất thay vì chỉ tạo giao diện có vẻ an toàn.
7. Viết code hoàn chỉnh, có kiểm thử và tài liệu triển khai.
8. Không chỉ trình bày ý tưởng, mockup hoặc pseudocode; hãy triển khai các chức năng có thể chạy thực tế.
9. Không hardcode mật khẩu, API key, private key hoặc bí mật vào source code.
10. Nếu một chức năng phụ thuộc dịch vụ ngoài, hãy triển khai phần tích hợp và cung cấp hướng dẫn lấy/cấu hình credentials; không giả vờ đã kết nối thành công.
11. Không tuyên bố đã kiểm thử hoặc đã triển khai AWS nếu chưa thực sự thực hiện.
12. Khi phát hiện thiết kế cũ thiếu an toàn, phải nêu rõ và sửa theo phương án có thể giải thích, kiểm chứng.

## 1. Phân tích hệ thống Seruchat hiện tại

Dự án hiện có:

- Frontend: HTML, CSS, JavaScript, Web Crypto API.
- Backend: Node.js, Express.
- Database: MySQL.
- Authentication: express-session, Argon2.
- Cryptography: X25519, HKDF-SHA256, AES-256-GCM.
- Lưu khóa: IndexedDB và encrypted private key backup.
- Java clients: Sender.java, Receiver.java, ApiClient.java.
- Chat 1-1, kết bạn, block/unblock, lịch sử tin nhắn.

Các file cần kiểm tra kỹ:

- `client/index.html`
- `client/css/style.css`
- `client/js/app.js`
- `client/js/keyIntegration.js`
- `client/js/encryption/keyManager.js`
- `client/js/encryption/encryption.js`
- `client/js/encryption/decryption.js`
- `server/src/server.js`
- `server/src/controllers/`
- `server/src/middleware/`
- `database/seruchat_full.sql`
- `server/test/`
- `encryption/`
- `docs/`

Đầu tiên hãy tạo tài liệu phân tích:

- Kiến trúc hiện tại.
- Luồng đăng ký và đăng nhập.
- Luồng tạo, lưu và khôi phục khóa X25519.
- Luồng gửi/nhận tin nhắn E2EE.
- Cơ chế phân quyền hiện tại.
- Những điểm yếu về bảo mật.
- Những file cần sửa, tạo mới.
- Kế hoạch migration.
- Các API cần bổ sung.

Không tự ý thay đổi định dạng ciphertext cũ khiến tin nhắn trong database không thể giải mã.

## 2. Nâng cấp UI/UX — Phong cách Snapchat

Thiết kế lại giao diện Seruchat theo phong cách hiện đại, trẻ trung, tối giản, mượt mà, lấy cảm hứng từ trải nghiệm Snapchat nhưng không sao chép nguyên mẫu logo, hình ảnh, thương hiệu hoặc các thành phần nhận diện độc quyền.

### 2.1. Định hướng thiết kế

- Mobile-first, responsive cho điện thoại, tablet và desktop.
- Giao diện thân thiện, đơn giản nhưng cao cấp.
- Có Light Mode và Dark Mode.
- Màu sắc tươi sáng, có thể sử dụng vàng làm màu nhấn.
- Typography rõ ràng, hỗ trợ tiếng Việt và emoji.
- Avatar hình tròn, góc bo mềm, hiệu ứng chuyển màn hình nhẹ.
- Skeleton loading, toast notification, confirmation dialog.
- Hiệu ứng hover, focus, loading, gửi tin và nhận tin mượt.
- Tôn trọng `prefers-reduced-motion`.
- Hỗ trợ sử dụng bằng bàn phím và các thuộc tính accessibility cần thiết.
- Không sử dụng hiệu ứng nặng làm giảm hiệu năng thiết bị yếu.

### 2.2. Các màn hình bắt buộc

1. Đăng ký tài khoản.
2. Đăng nhập và xác minh email.
3. Quên mật khẩu.
4. Thiết lập bảo mật và PIN khôi phục.
5. Trang chính danh sách hội thoại.
6. Chat cá nhân.
7. Chat nhóm.
8. Danh sách bạn bè và lời mời kết bạn.
9. Tìm kiếm người dùng.
10. Profile cá nhân.
11. Chỉnh sửa profile.
12. Cài đặt tài khoản và quyền riêng tư.
13. Quản lý thiết bị đăng nhập.
14. Lịch sử và tùy chọn backup.
15. Quản lý nhóm và thành viên.
16. Admin Dashboard.
17. Các màn hình lỗi 403, 404, 429 và lỗi mạng.

### 2.3. Giao diện chat

Cần có:

- Sidebar danh sách hội thoại.
- Avatar và tên người dùng.
- Nhãn chat cá nhân hoặc nhóm.
- Thông báo tin nhắn chưa đọc.
- Hiển thị trạng thái đang tải/gửi/thất bại.
- Gửi emoji Unicode.
- Emoji picker.
- Gửi ảnh và file.
- Preview ảnh an toàn.
- Download file đã giải mã.
- Tự cuộn đến tin mới, nhưng không phá trải nghiệm khi người dùng đang đọc lịch sử.
- Tìm kiếm cuộc trò chuyện.
- Tìm kiếm nội dung tin nhắn ở phía client khi có thể, tránh đưa plaintext lên server để tìm kiếm.
- Trạng thái E2EE và thông tin xác minh khóa.
- Giao diện thông báo khi public key thay đổi.
- Empty state khi chưa có bạn hoặc hội thoại.

Không mặc định tự xóa tin nhắn chỉ vì giao diện lấy cảm hứng từ Snapchat. Tính năng tin nhắn tự biến mất, nếu bổ sung, phải là tùy chọn độc lập với cơ chế lưu lịch sử và backup.

Ưu tiên giữ frontend JavaScript hiện tại nếu có thể triển khai hợp lý. Chỉ chuyển sang React/Vite nếu giải thích được lợi ích, chi phí và có phương án migration không làm mất tính năng.

## 3. Đăng ký và quản lý tài khoản

### 3.1. Thông tin đăng ký

Bổ sung các trường:

- Họ và tên hiển thị.
- Username/handle dùng để tìm kiếm.
- Email.
- Số điện thoại Việt Nam.
- Ngày sinh.
- Mật khẩu.
- Xác nhận mật khẩu.
- Đồng ý điều khoản và chính sách quyền riêng tư.

Đề xuất email và ngày sinh là bắt buộc. Yêu cầu số điện thoại có thể cấu hình bắt buộc hoặc tùy chọn theo môi trường; nếu chưa tích hợp dịch vụ SMS thực tế thì không được coi số điện thoại là đã xác minh.

Phân biệt:

- `user_id`: ID bất biến.
- `username`: định danh tìm kiếm, duy nhất.
- `display_name`: tên hiển thị, có thể trùng.
- `email`: định danh đăng nhập.
- `phone_e164`: số điện thoại chuẩn hóa.
- `date_of_birth`: ngày sinh dạng DATE.
- `avatar`: ảnh đại diện.
- `bio`: giới thiệu bản thân.
- `role`: phân quyền hệ thống.
- `status`: trạng thái tài khoản.

### 3.2. Kiểm tra email/Gmail

- Validate cú pháp ở frontend và backend.
- Không kiểm tra bằng regex quá đơn giản rồi kết luận email tồn tại.
- Hỗ trợ Gmail và các nhà cung cấp email hợp lệ khác.
- Không mặc định mọi email phải có đuôi `@gmail.com`.
- Normalize email có kiểm soát.
- Không tùy tiện xóa dấu chấm hoặc phần `+alias` của Gmail khi kiểm tra danh tính.
- Gửi email verification token hoặc OTP có thời hạn.
- OTP phải có giới hạn số lần thử, resend cooldown và chống replay.
- Chỉ đánh dấu `email_verified=true` sau khi xác minh thành công.
- Tránh user enumeration trong luồng đăng nhập/khôi phục tài khoản.
- Nếu sử dụng đăng nhập Google thì triển khai Google OAuth 2.0/OpenID Connect đúng chuẩn, không giả lập bằng kiểm tra đuôi Gmail.

### 3.3. Kiểm tra số điện thoại Việt Nam

Sử dụng thư viện đáng tin cậy như `libphonenumber-js` với metadata phù hợp, không chỉ một regex tự viết.

Yêu cầu:

- Chấp nhận số nội địa hợp lệ, ví dụ `0912345678`.
- Chấp nhận định dạng quốc tế, ví dụ `+84912345678`.
- Hỗ trợ cách nhập có khoảng trắng hợp lý.
- Kiểm tra đầu số di động và độ dài theo quy hoạch hiện hành của Việt Nam.
- Không chấp nhận dữ liệu sai định dạng.
- Chuẩn hóa lưu trữ thành E.164.
- Không sử dụng kiểu dữ liệu số nguyên cho số điện thoại.
- Phân biệt số đúng định dạng với số đã được xác minh là thuộc sở hữu người dùng.
- SMS OTP chỉ được coi là hoàn thành khi một dịch vụ SMS thực tế xác minh thành công.
- Chống spam gửi OTP, giới hạn số lần thử và thời gian sử dụng OTP.
- Không làm lộ số điện thoại công khai nếu người dùng chưa đồng ý.
- Kiểm tra tính duy nhất của số đã xác minh theo chính sách tài khoản.

### 3.4. Ngày sinh

- Validate ngày thực tế, bao gồm năm nhuận.
- Không cho phép ngày sinh tương lai.
- Không chỉ kiểm tra độ dài chuỗi.
- Quy định độ tuổi tối thiểu phải cấu hình theo chính sách và quy định áp dụng, không hardcode một giá trị tùy tiện.
- Không công khai ngày sinh mặc định.
- Có tùy chọn hiển thị ngày/tháng sinh nhưng ẩn năm.
- Không dùng ngày sinh làm câu hỏi bảo mật hay phương thức khôi phục tài khoản.

### 3.5. Profile

Cho phép người dùng:

- Đổi tên hiển thị.
- Đổi username theo chính sách và giới hạn tần suất.
- Đổi ảnh đại diện.
- Cập nhật bio.
- Đổi email với xác minh lại.
- Đổi số điện thoại với OTP.
- Đổi mật khẩu.
- Thay đổi tùy chọn hiển thị thông tin.
- Xem các thiết bị đang đăng nhập.
- Đăng xuất từng thiết bị hoặc toàn bộ thiết bị.
- Xem thông tin khóa E2EE.
- Quản lý PIN và recovery key.
- Yêu cầu xuất hoặc xóa dữ liệu tài khoản theo chính sách ứng dụng.

Ảnh đại diện phải có giới hạn dung lượng, xác minh định dạng file thực tế, xử lý metadata và lưu trữ an toàn.

Các hành động nhạy cảm phải yêu cầu re-authentication và ghi audit log thích hợp.

## 4. Admin Account và Admin Dashboard

Xây dựng hệ thống quản trị riêng cho Seruchat.

Phân quyền đề xuất:

- `user`: người dùng thông thường.
- `admin`: quản trị ứng dụng.
- `super_admin`: quản trị cấp cao, chỉ cấp khi thực sự cần.

Không cho phép người dùng tự chọn role khi đăng ký.

Không tạo tài khoản Admin mặc định với mật khẩu chung. Cần có CLI hoặc bootstrap command an toàn để cấp quyền Admin lần đầu.

Admin Dashboard có:

- Tổng số tài khoản.
- Số tài khoản đã xác minh email.
- Số người dùng hoạt động theo thời gian.
- Số nhóm chat và hội thoại.
- Thống kê số lượng tin nhắn mà không giải mã nội dung.
- Dung lượng file lưu trữ.
- Danh sách tài khoản.
- Tạm khóa/mở khóa tài khoản.
- Xử lý báo cáo spam, lạm dụng.
- Quản lý giới hạn dung lượng upload.
- Quản lý cấu hình hệ thống được phép thay đổi.
- Nhật ký bảo mật.
- Thống kê đăng nhập thất bại.
- Danh sách IP đáng ngờ theo dữ liệu có sẵn và chính sách lưu log.
- Thống kê lỗi API và trạng thái dịch vụ.

Yêu cầu bảo mật Admin:

1. RBAC bắt buộc kiểm tra tại backend.
2. Không tin role do frontend truyền lên.
3. Admin không được mặc định đọc plaintext của tin nhắn E2EE.
4. Admin phải có MFA bằng TOTP hoặc phương án tương đương.
5. Re-authentication khi làm thao tác quan trọng.
6. Có audit log bất biến ở mức ứng dụng hoặc chống sửa đổi ở mức hợp lý.
7. Không ghi password, PIN, private key, plaintext hoặc token bí mật vào log.
8. Ngăn IDOR và truy cập API quản trị từ tài khoản thường.
9. Bảo vệ thao tác Admin trước CSRF, XSS, session hijacking.
10. Phân biệt quyền quản trị ứng dụng và quyền SSH/sudo trên EC2.

Admin Dashboard chạy trên đường dẫn riêng, ví dụ `/admin`, qua HTTPS. Không cần mở cổng quản trị công khai riêng.

## 5. Chat nhóm E2EE bằng Key Wrap

**Chọn phương pháp B – Key Wrap. Đây là phương pháp mã hóa nhóm chính của phiên bản mới.**

Không sử dụng Fan-out để mã hóa lại toàn bộ nội dung cho mỗi người.

### 5.1. Cơ chế bắt buộc

Khi Alice gửi một tin vào nhóm:

1. Tạo một Content Encryption Key (CEK) ngẫu nhiên 256 bit.
2. Tạo IV AES-GCM mới.
3. Mã hóa nội dung tin nhắn đúng một lần bằng CEK.
4. Với từng thành viên hợp lệ, dùng X25519 + HKDF để tạo wrapping key.
5. Mã hóa CEK riêng cho từng thành viên bằng wrapping key.
6. Lưu một ciphertext chung và các wrapped keys theo recipient.
7. Người nhận dùng private key của mình để mở wrapped CEK.
8. Dùng CEK vừa khôi phục để giải mã nội dung.
9. Người gửi phải có khả năng đọc lại lịch sử của chính mình.
10. Không bao giờ gửi CEK plaintext lên server.

Cần có:

- Versioned envelope format.
- Thuật toán và phiên bản giao thức rõ ràng.
- Nonce/IV riêng cho từng phép AES-GCM.
- AAD ràng buộc message ID, conversation ID, sender ID, recipient ID khi phù hợp, loại tin và phiên bản thành viên.
- Xác thực danh tính người gửi bằng cơ chế mật mã phù hợp.
- Kiểm tra public key chống tráo khóa.
- Chống replay và chống nhầm bản mã giữa các hội thoại.
- Kiểm thử tính toàn vẹn ciphertext và metadata.

### 5.2. Tính năng nhóm

- Tạo nhóm.
- Đặt tên nhóm.
- Avatar nhóm.
- Mô tả nhóm.
- Thêm thành viên.
- Mời thành viên.
- Chấp nhận/từ chối lời mời.
- Rời nhóm.
- Xóa thành viên.
- Chuyển quyền quản trị nhóm.
- Phân quyền owner/admin/member.
- Xem danh sách thành viên.
- Chặn người dùng và xử lý tương tác trong nhóm theo chính sách.
- Lịch sử tin nhóm.
- Hiển thị người gửi.
- Hiển thị trạng thái E2EE.

Khi thay đổi thành viên:

- Phải kiểm tra quyền ở server.
- Phải ràng buộc bản mã với phiên bản danh sách thành viên.
- Người đã rời nhóm không được nhận khóa cho tin tương lai.
- Thành viên mới không tự động đọc lịch sử cũ.
- Không được tuyên bố rằng có thể thu hồi tin mà người dùng đã giải mã hoặc lưu trước đó.
- Phải xử lý trường hợp hai thao tác thêm/xóa thành viên và gửi tin xảy ra đồng thời.

Giữ tương thích với chat 1-1 hiện tại.

## 6. Gửi ảnh, file và tài liệu bằng E2EE

Bổ sung:

- Upload ảnh JPG, PNG, WEBP.
- Gửi PDF, TXT, DOCX và các loại file được cấu hình cho phép.
- Download và giải mã trên client.
- Preview ảnh sau khi giải mã.
- Hiển thị tên file, dung lượng, trạng thái upload.
- Giới hạn file ban đầu 10 MB, có cấu hình thay đổi.
- Hiển thị tiến trình upload/download.
- Xử lý gián đoạn mạng.
- Kiểm tra quota.
- Không thực thi file upload trên server.

Cơ chế mã hóa:

1. Sinh một file encryption key ngẫu nhiên.
2. AES-256-GCM mã hóa file tại client.
3. Upload file ciphertext dạng binary.
4. Mã hóa file key theo Key Wrap cho các thành viên được phép.
5. Lưu file ID, hash kiểm tra tính toàn vẹn, metadata đã được bảo vệ phù hợp và wrapped keys.
6. Người nhận tải ciphertext và giải mã tại thiết bị.

Không gửi file lớn bằng Base64 bên trong JSON tin nhắn.

Giai đoạn đầu có thể lưu ciphertext trên Docker volume hoặc EBS; thiết kế abstraction cho Amazon S3 về sau.

Tên file và MIME có thể tiết lộ thông tin. Những metadata nhạy cảm phải được bảo vệ bằng envelope E2EE khi có thể.

## 7. Backup E2EE và khôi phục tin nhắn bằng PIN như Messenger

Đây là yêu cầu rất quan trọng.

Tôi muốn trải nghiệm người dùng tương tự Messenger:

- Người dùng thiết lập PIN khôi phục.
- Khi đăng nhập thiết bị mới, ứng dụng yêu cầu phương thức khôi phục.
- Người dùng có thể nhập PIN để truy cập lại lịch sử đã mã hóa.
- Có phương án recovery key dự phòng.
- Người dùng được cảnh báo nếu không còn cách khôi phục.

**Tuyệt đối không được coi việc mã hóa private key trực tiếp bằng PIN 6 chữ số + PBKDF2 hoặc Argon2id rồi lưu công khai ciphertext trong database là đủ an toàn.** PIN có không gian tìm kiếm nhỏ, có nguy cơ bị brute force offline khi backup bị đánh cắp.

### 7.1. Phân tích và thiết kế trước khi triển khai

Hãy thiết kế key hierarchy gồm:

- Identity encryption keys.
- Message encryption keys.
- Content encryption keys.
- Key-encryption/wrapping keys.
- Backup/recovery key.
- Recovery mechanism.

Phân biệt:

- Mật khẩu đăng nhập.
- PIN khôi phục.
- Recovery key có entropy cao.
- Private key X25519 lâu dài.
- Các khóa dùng mã hóa nội dung.

Ưu tiên thiết kế recovery key ngẫu nhiên có entropy cao được tạo tại client, backup được mã hóa bằng khóa mạnh.

Nếu cung cấp UX khôi phục chỉ bằng PIN 6 chữ số, phải có cơ chế server-assisted recovery với xác minh người dùng và giới hạn thử PIN thực sự có hiệu lực, lưu bền vững và không thể vượt qua bằng việc chỉ tải ciphertext để thử offline. Cần phân tích rõ các giả định tin cậy, mô hình quản lý bí mật và khả năng server bị xâm nhập. Có thể nghiên cứu KMS/HSM hoặc giao thức khôi phục chuyên dụng đã được kiểm chứng.

Nếu phạm vi đồ án không thể triển khai một hệ thống khôi phục bằng PIN 6 chữ số bảo đảm chống offline guessing, phải trung thực:

- Triển khai recovery key mạnh hoặc recovery passphrase làm cơ chế an toàn chính.
- PIN có thể là bước UX bổ sung gắn với thiết bị đã tin cậy hoặc một quy trình online được bảo vệ.
- Không quảng cáo PIN ngắn là zero-knowledge recovery an toàn khi chưa đáp ứng mô hình đe dọa.

### 7.2. Luồng thiết bị mới

1. Người dùng đăng nhập bằng tài khoản.
2. Xác thực thiết bị mới và MFA theo chính sách.
3. Ứng dụng kiểm tra local IndexedDB.
4. Nếu chưa có private key, yêu cầu khôi phục.
5. Người dùng nhập PIN hoặc dùng recovery key.
6. Thực hiện quy trình mở khóa backup an toàn.
7. Khôi phục đúng private key lâu dài.
8. Kiểm tra private key có tương ứng public key đã đăng ký.
9. Đồng bộ ciphertext và wrapped keys.
10. Giải mã lịch sử trên thiết bị mới.

Không tạo đè keypair cũ khi API gặp lỗi.

Không tự thay public key của tài khoản chỉ vì đổi máy.

### 7.3. Quản lý backup

- Thiết lập, đổi và vô hiệu hóa PIN theo cơ chế an toàn.
- Xem trạng thái backup.
- Xuất recovery key theo quy trình bảo mật.
- Phương án khôi phục từ thiết bị đang tin cậy.
- Khóa hoặc làm chậm thử PIN nhiều lần theo chính sách.
- Thông báo thiết bị mới.
- Xác minh lại trước thao tác nhạy cảm.
- Không hiển thị PIN plaintext sau khi thiết lập.
- Không log recovery key hoặc private key.
- Thay đổi mật khẩu đăng nhập không được vô tình phá backup.
- Quên mật khẩu đăng nhập không đồng nghĩa với việc tự động khôi phục được khóa E2EE.
- Có kiểm thử mất thiết bị, đổi trình duyệt, đăng nhập lại và sai PIN.

Hãy phân biệt rõ sao lưu ciphertext lịch sử và sao lưu các bí mật cần thiết để giải mã lịch sử.

Nghiên cứu Messenger Secure Storage/Labyrinth để tham khảo mô hình trải nghiệm và phân tích giao thức, không khẳng định tự triển khai giống hoàn toàn Messenger nếu không có bằng chứng.

## 8. Xác thực public key và chống server giả mạo

Seruchat hiện có nguy cơ server tráo public key.

Hãy bổ sung:

- Key identity pinning theo tài khoản.
- TOFU khi phù hợp, với cảnh báo rõ về giới hạn trong lần kết nối đầu.
- Kiểm tra và cảnh báo khi public key của người nhận thay đổi.
- Quy trình xác minh lại khóa.
- Cơ chế xác thực người gửi phù hợp, có thể sử dụng cặp khóa chữ ký độc lập.
- Chống việc metadata server bị sửa dẫn đến giả danh người gửi.
- Kiểm thử trường hợp server trả public key giả.

Cần phân biệt ba mô hình tấn công:

1. Hacker chỉ đọc MySQL.
2. Hacker sửa dữ liệu hoặc phản hồi API.
3. Hacker kiểm soát server và thay JavaScript được gửi tới trình duyệt.

Không được tuyên bố rằng E2EE web chống hoàn toàn trường hợp 3 nếu không có cơ chế tin cậy và kiểm chứng client độc lập.

## 9. CAPTCHA và phòng chống brute-force

Tích hợp Cloudflare Turnstile.

### Chính sách đề xuất

- Không bắt người dùng giải CAPTCHA ở mọi lần đăng nhập bình thường.
- Hiển thị CAPTCHA khi phát hiện nhiều lần đăng nhập sai hoặc hành vi đáng ngờ.
- Từ khoảng 3 lần sai trong 10 phút có thể yêu cầu challenge; ngưỡng phải cấu hình được.
- Các lần thử tiếp theo chịu throttling theo tài khoản và IP.
- Bảo vệ đăng ký, quên mật khẩu, gửi OTP và các endpoint nhạy cảm.
- Không để người dùng vượt CAPTCHA bằng cách gọi trực tiếp API.
- Không khóa vĩnh viễn một tài khoản chỉ vì có người khác cố tình nhập sai mật khẩu.

Backend phải:

- Gửi token Turnstile tới Cloudflare Siteverify.
- Xác minh `success`, `hostname`, `action` nếu áp dụng và thời hạn token.
- Không chấp nhận token cũ hoặc đã sử dụng.
- Dùng secret key từ biến môi trường.
- Có timeout và cách xử lý lỗi dịch vụ.
- Chống user enumeration.
- Trả HTTP 429 và `Retry-After` phù hợp.

Bộ đếm thất bại cần tồn tại ngoài RAM tiến trình Node.js, chẳng hạn Redis hoặc kho dữ liệu phù hợp.

Mật khẩu tiếp tục dùng Argon2id với tham số an toàn, có kiểm soát độ dài và chính sách mật khẩu hợp lý.

## 10. Tăng cường bảo mật backend

Triển khai và kiểm tra:

- Session rotation khi đăng nhập.
- Secure/HttpOnly/SameSite cookie.
- CSRF protection.
- Origin validation.
- CORS chỉ cho phép origin dự kiến.
- Security headers và CSP phù hợp với Web Crypto/Turnstile.
- Input validation và output encoding.
- Chống SQL injection bằng prepared statements.
- Chống XSS.
- Chống IDOR.
- RBAC.
- Giới hạn kích thước request.
- Rate limiting theo endpoint, tài khoản và IP.
- Phân trang tin nhắn.
- Giới hạn số request polling và tải lịch sử.
- Không trả toàn bộ lịch sử vô hạn mỗi 2,5 giây.
- Logging có loại bỏ dữ liệu nhạy cảm.
- Dependency audit.
- Bảo mật upload.
- Chống đường dẫn traversal.
- Cơ chế revoke session.
- Theo dõi phiên đăng nhập bất thường.
- Quy trình reset password an toàn.
- Không ghi plaintext tin nhắn, PIN, private key hoặc session secret vào log.

Nếu bổ sung WebSocket để chat realtime, phải xác thực kết nối, kiểm soát quyền subscription và giới hạn lưu lượng.

## 11. Triển khai bằng Docker Compose

Tạo các file phù hợp:

- `Dockerfile`
- `.dockerignore`
- `compose.yaml`
- `compose.dev.yaml` nếu cần
- `Caddyfile`
- `.env.example`
- Healthcheck
- Scripts triển khai và backup
- Tài liệu triển khai

Kiến trúc đề xuất:

- `app`: Node.js Express.
- `db`: MySQL.
- `redis`: rate limit/session hoặc tác vụ cần dùng Redis.
- `proxy`: Caddy.
- `storage`: Docker volume/EBS, có phương án mở rộng sang S3.

Yêu cầu:

- Không chạy Node.js bằng root nếu có thể.
- Multi-stage build khi phù hợp.
- Không đưa file `.env` hoặc private key vào Docker image.
- Chỉ publish cổng 80/443 của reverse proxy.
- Không publish MySQL 3306 và Express 3000 ra Internet.
- Docker network phân tách frontend/backend và database.
- Persistent volumes cho MySQL và file upload.
- Healthcheck và restart policy.
- Dùng image/version được hỗ trợ, cập nhật bản vá.
- Cấu hình CPU/RAM/resource limits phù hợp với máy EC2.
- Docker secrets hoặc cơ chế quản lý bí mật phù hợp.
- Xử lý graceful shutdown.
- Kiểm tra migration trước khi khởi động production.
- Có phương án rollback.
- Có test sau khi restart container.

Không được chạy file schema khởi tạo theo cách xóa hoặc ghi đè database đã có dữ liệu.

## 12. Hướng dẫn triển khai lên AWS EC2 từ đầu đến cuối

Tôi muốn tài liệu **từng bước cho người mới dùng AWS**, bằng tiếng Việt, với lệnh có thể copy và chú thích lệnh chạy ở đâu.

### 12.1. Chuẩn bị AWS

Hướng dẫn:

1. Tạo tài khoản AWS và bảo mật tài khoản.
2. Bật MFA cho tài khoản quản trị AWS.
3. Tạo IAM identity phù hợp, không dùng root AWS cho công việc hằng ngày.
4. Cấu hình AWS Budget/cảnh báo chi phí.
5. Chọn region phù hợp.
6. Tạo EC2 Ubuntu LTS.
7. Chọn loại máy đủ tài nguyên cho Node.js, MySQL và Redis.
8. Tạo SSH key pair hoặc phương án AWS Systems Manager Session Manager.
9. Tạo Elastic IP nếu cần IP cố định, giải thích khả năng phát sinh chi phí.
10. Cấu hình domain và DNS.
11. Cấu hình backup dữ liệu.

### 12.2. AWS Security Group

Mặc định:

- SSH 22/TCP: chỉ IP quản trị được phép.
- HTTP 80/TCP: công khai nếu cần redirect/chứng chỉ.
- HTTPS 443/TCP: công khai.
- 3000/TCP: không công khai.
- 3306/TCP: không công khai.
- 6379/TCP: không công khai.
- Các cổng nội bộ khác: không mở công khai.

Giải thích inbound/outbound rules, IP/CIDR, IPv4/IPv6, public/private IP và NAT.

Không dùng `0.0.0.0/0` cho SSH trong production.

### 12.3. Cấu hình máy chủ Ubuntu

Viết đầy đủ các lệnh để:

- SSH vào EC2 từ Windows PowerShell.
- Update hệ điều hành.
- Tạo user quản trị có sudo nếu cần.
- Thiết lập SSH key authentication.
- Tắt đăng nhập root SSH trực tiếp.
- Cấu hình SSH an toàn.
- Cài Git.
- Cài Docker Engine và Compose Plugin theo hướng dẫn chính thức.
- Kiểm tra Docker.
- Clone repository.
- Tạo biến môi trường.
- Tạo mật khẩu MySQL và session secret an toàn.
- Khởi tạo database.
- Build và chạy ứng dụng.
- Xem log.
- Restart.
- Update code.
- Backup/restore.
- Kiểm tra healthcheck.

Phân biệt rõ lệnh chạy trên Windows, EC2 Ubuntu, container và MySQL.

### 12.4. HTTPS và tên miền

Sử dụng Caddy hoặc Nginx + Certbot.

Hướng dẫn:

- Tạo DNS A record.
- Gắn domain với EC2.
- Cấu hình reverse proxy.
- Tự động redirect HTTP sang HTTPS.
- Cấp và gia hạn TLS certificate.
- Kiểm tra certificate.
- Cấu hình forwarded headers an toàn.
- Cấu hình secure session cookie.
- Chặn truy cập trực tiếp backend.
- Kiểm tra Web Crypto hoạt động trên trình duyệt khác qua HTTPS.
- Cấu hình routing cho `/api`, `/admin`, static files và các đường dẫn cần thiết.

### 12.5. Firewall nhiều lớp

Giải thích và cấu hình:

- AWS Security Group.
- Firewall host nếu cần.
- Docker network isolation.
- Khác biệt giữa Docker published ports và UFW.
- Cloudflare proxy và WAF khi sử dụng.
- Quy tắc chặn truy cập database.
- Kiểm tra cổng thực tế đang mở bằng `ss`, Docker và công cụ kiểm tra từ bên ngoài.
- Quy trình không tự khóa mình khỏi SSH.

Không được giả định chỉ bật UFW là đã bảo vệ được các port Docker được publish.

## 13. Chống DDoS cơ bản và chống lạm dụng

Thiết lập bảo vệ nhiều lớp:

- Cloudflare DNS/proxy khi có domain.
- Cloudflare WAF và rule phù hợp.
- Cloudflare DDoS protection theo quyền lợi gói đang sử dụng.
- Rate limiting ở reverse proxy.
- Rate limiting ở Express.
- Rate limiting cho đăng nhập, đăng ký, OTP, tìm kiếm, tin nhắn, nhóm và upload.
- Giới hạn request body.
- Giới hạn kết nối và timeout.
- Chống upload flood.
- Chống tạo hàng loạt tài khoản.
- Chống spam lời mời kết bạn.
- Caching tài nguyên tĩnh có cấu hình đúng.
- Monitoring CPU, RAM, disk, network và số request.
- Cảnh báo khi có bất thường.
- Cơ chế chặn tạm thời có thời hạn.
- Không cấu hình nhầm chặn người dùng hợp lệ.

Nếu đi qua Cloudflare, phải xác minh đúng client IP và trusted proxy. Không được tin các header IP do client tự gửi.

Giải thích cách hạn chế truy cập trực tiếp tới origin khi phù hợp để tránh bypass Cloudflare, đồng thời giữ đường quản trị an toàn.

Phân biệt:

- Brute-force.
- Credential stuffing.
- Spam API.
- HTTP flood.
- SYN flood.
- Network/volumetric DDoS.

Không quảng cáo rằng một EC2 nhỏ, UFW hoặc fail2ban có thể chống được mọi đợt DDoS lớn. Nêu rõ giới hạn của từng lớp bảo vệ.

## 14. Phương án khi server bị hack

Tạo tài liệu threat model và incident response.

Phân tích riêng các trường hợp:

1. Lộ source code.
2. Lộ `.env`.
3. Lộ session secret.
4. Database bị đọc.
5. Database bị chỉnh sửa.
6. File backup khóa bị đánh cắp.
7. Hacker thay public key của người nhận.
8. Hacker sửa API response.
9. Hacker thay JavaScript frontend.
10. Hacker lấy được quyền SSH hoặc root.
11. Hacker chiếm được Admin Dashboard.
12. Hacker thay đổi thành viên nhóm trái phép.
13. Hacker xóa hoặc mã hóa dữ liệu server để tống tiền.

Với từng trường hợp:

- Kẻ tấn công đọc được dữ liệu nào?
- Những bí mật nào có thể bị lộ?
- E2EE còn bảo vệ được gì?
- Các biện pháp phòng ngừa.
- Cách phát hiện.
- Các bước cô lập và ứng cứu.
- Quy trình rotate credentials.
- Revocation session.
- Kiểm tra integrity.
- Restore từ backup sạch.
- Thông báo người dùng khi cần.
- Làm sao tránh lặp lại sự cố.

Bổ sung:

- Database backup tự động.
- Mã hóa backup at rest.
- Kiểm thử restore định kỳ.
- Backup không nằm duy nhất trên EC2.
- IAM least privilege.
- Không dùng tài khoản MySQL root từ ứng dụng.
- SSH key và MFA ở những nơi hỗ trợ.
- Kiểm soát secrets.
- Giới hạn truy cập file và volume.
- Audit logs.
- Theo dõi đăng nhập quản trị.
- Quy trình cập nhật dependency và hệ điều hành.

Quan trọng: không đưa ra lời hứa tuyệt đối rằng website E2EE vẫn an toàn khi hacker có toàn quyền thay JavaScript phía client được phân phối từ server.

## 15. Database và migration

Phân tích schema MySQL hiện tại rồi tạo migration versioned, có khả năng rollback trong giới hạn của migration.

Những bảng/nhóm dữ liệu có thể cần bổ sung:

- User profiles.
- Email verification.
- Phone verification.
- Devices/sessions.
- Roles/permissions.
- Security events.
- Login attempts.
- Recovery/backup metadata.
- Groups và group members.
- Group membership versions.
- Group messages và encrypted envelopes.
- Attachments.
- Admin audit logs.
- User reports.
- Notifications.

Các bảng mới phải có:

- Primary keys.
- Foreign keys phù hợp.
- Unique constraints.
- Index cho truy vấn phổ biến.
- Timestamp.
- Kiểm soát transaction.
- Quy tắc xóa dữ liệu rõ ràng.

Không đặt private key plaintext hoặc message plaintext vào MySQL.

Không sử dụng `DROP TABLE`, `TRUNCATE` hoặc migration phá hủy lịch sử cũ.

## 16. Testing bắt buộc

Tạo hoặc bổ sung unit test, integration test và end-to-end test.

### Tài khoản

- Email hợp lệ/không hợp lệ.
- Email chưa xác minh.
- Gmail alias.
- Số điện thoại Việt Nam hợp lệ/không hợp lệ.
- Chuẩn hóa E.164.
- Ngày sinh hợp lệ và ngày ảo.
- Đăng ký trùng thông tin.
- Đổi profile.
- Upload avatar sai định dạng.
- Đổi mật khẩu.
- Reset password.
- Đăng xuất và revoke session.

### Authentication

- Sai mật khẩu nhiều lần.
- CAPTCHA hợp lệ, sai, hết hạn, replay.
- Rate limit theo IP và tài khoản.
- Brute-force bằng nhiều IP trong phạm vi kiểm thử.
- Admin MFA.
- User không thể truy cập API Admin.
- IDOR.
- CSRF.
- Session fixation.
- XSS cơ bản.

### E2EE

- Tin tiếng Việt.
- Emoji phức hợp.
- Chat 1-1 cũ vẫn đọc được.
- Chat nhóm 3, 10 và 20 người.
- Wrapped key đúng recipient.
- Wrapped key bị sửa.
- Ciphertext bị sửa.
- Public key bị thay.
- Sai phiên bản thành viên.
- Người đã rời nhóm không có khóa cho tin mới.
- Thành viên mới không tự đọc lịch sử cũ.
- Tin gửi khi thành viên thay đổi đồng thời.
- Người gửi đọc được lịch sử của mình.
- Backup và restore trên thiết bị mới.
- Sai PIN.
- Quên recovery key.
- Backup sai hoặc bị thay thế.
- Khôi phục private key có khớp public key cũ.

### Deployment

- Docker build thành công.
- Container restart không mất dữ liệu.
- MySQL chỉ dùng mạng nội bộ.
- Không expose Redis.
- HTTPS hợp lệ.
- HTTP redirect sang HTTPS.
- Secure cookie.
- Rate limit sau reverse proxy.
- Backup database.
- Restore database.
- Rollback phiên bản ứng dụng.

Chỉ báo cáo test PASS khi thực sự đã chạy và có kết quả.

## 17. Tài liệu cần bàn giao

Tạo các tài liệu:

1. `ARCHITECTURE.md` — Kiến trúc tổng thể.
2. `SECURITY.md` — Mô hình đe dọa và bảo mật.
3. `E2EE_PROTOCOL.md` — Luồng mật mã và Key Wrap.
4. `BACKUP_RECOVERY.md` — Cấu trúc backup và PIN/recovery key.
5. `API.md` — Tài liệu API.
6. `DATABASE.md` — Schema và migration.
7. `AWS_DEPLOYMENT.md` — Hướng dẫn AWS từ đầu.
8. `DOCKER_GUIDE.md` — Docker/Compose.
9. `FIREWALL_DDOS.md` — Firewall và chống DDoS.
10. `ADMIN_GUIDE.md` — Hướng dẫn quản trị Seruchat.
11. `TESTING.md` — Cách kiểm thử và kết quả.
12. `CHANGELOG.md` — Những thay đổi.

Tài liệu phải viết bằng tiếng Việt, có lệnh thực tế, giải thích mục đích và ví dụ kết quả.

## 18. Cách thực hiện công việc

Không triển khai tất cả một cách lộn xộn. Hãy làm theo các giai đoạn:

**Giai đoạn 1 — Kiểm tra và bảo toàn dự án**

- Đọc mã nguồn.
- Chạy test hiện tại.
- Xác định điểm yếu.
- Thiết kế database migration.
- Thiết lập nhánh phát triển và kế hoạch rollback.

**Giai đoạn 2 — Tài khoản, xác minh và Profile**

- Thêm thông tin đăng ký.
- Email/phone validation.
- Verification.
- Profile và avatar.
- Password reset và quản lý phiên.

**Giai đoạn 3 — Giao diện**

- Thiết kế UI lấy cảm hứng Snapchat.
- Responsive.
- Chat, danh sách hội thoại, settings.
- Dark mode và hiệu ứng.

**Giai đoạn 4 — E2EE nhóm**

- Database nhóm.
- Group APIs.
- Key Wrap.
- Quản lý thành viên.
- Bảo vệ metadata, kiểm thử giải mã.

**Giai đoạn 5 — File E2EE**

- Mã hóa file.
- Upload/download.
- Wrapped file key.
- Quota và storage.

**Giai đoạn 6 — Khôi phục lịch sử**

- Phân tích mô hình PIN.
- Recovery key.
- Backup/restore an toàn.
- Thiết bị mới.
- Kiểm thử mất thiết bị.

**Giai đoạn 7 — Admin và bảo mật**

- RBAC.
- Admin Dashboard.
- MFA.
- CAPTCHA.
- Rate limiting.
- Logging và security hardening.

**Giai đoạn 8 — DevOps và AWS**

- Docker Compose.
- Reverse proxy/HTTPS.
- EC2.
- Security Group.
- Cloudflare.
- Backup/monitoring.
- Kiểm thử từ Internet.

Sau mỗi giai đoạn phải trình bày:

- File đã tạo hoặc sửa.
- Migration đã bổ sung.
- API mới.
- Những thay đổi về bảo mật.
- Cách chạy.
- Test đã thực hiện và kết quả.
- Những giới hạn còn tồn tại.

## 19. Tiêu chí hoàn thành cuối cùng

Dự án được xem là hoàn thành khi:

- Người dùng có thể truy cập Seruchat qua HTTPS từ hai mạng khác nhau.
- Đăng ký và xác minh tài khoản hoạt động.
- Số điện thoại Việt Nam được kiểm tra và chuẩn hóa đúng.
- Profile có thể chỉnh sửa.
- Có avatar.
- Giao diện hiện đại, responsive theo phong cách Snapchat.
- Chat 1-1 E2EE cũ hoạt động.
- Chat nhóm Key Wrap hoạt động.
- Gửi emoji Unicode hoạt động.
- Gửi file E2EE hoạt động.
- Có quy trình backup và khôi phục khóa/lịch sử an toàn, không đánh đồng PIN 6 chữ số với một khóa bí mật mạnh.
- Có Admin Dashboard được phân quyền.
- Đăng nhập sai nhiều lần kích hoạt phòng vệ và CAPTCHA.
- Admin có MFA.
- MySQL/Redis/Node.js không lộ cổng nội bộ.
- HTTPS và firewall được cấu hình.
- Có bảo vệ DDoS cơ bản nhiều lớp.
- Có backup và quy trình restore.
- Có hướng dẫn AWS và Docker đủ chi tiết cho người mới.
- Không làm mất khả năng đọc tin nhắn cũ do vô tình thay private key.
- Test chức năng và bảo mật quan trọng đạt yêu cầu.
- Tài liệu nêu trung thực giới hạn của E2EE web, backup PIN và khả năng chống server bị chiếm quyền.

## 20. Quy tắc khi trả lời và viết code

- Trao đổi hoàn toàn bằng tiếng Việt.
- Giải thích rõ thao tác trên Client, Backend, MySQL, Docker và AWS.
- Không tự ý cắt bỏ phạm vi yêu cầu.
- Không tự ý viết lại thuật toán mật mã theo cách chưa được kiểm chứng.
- Ưu tiên thư viện và giao thức bảo mật đã được đánh giá.
- Không đưa demo giả vào thay thế chức năng thực tế.
- Không dùng mock API trong bản production.
- Không bỏ qua migration và kiểm thử.
- Không tạo mật khẩu Admin cố định.
- Không yêu cầu tôi gửi thông tin bí mật vào chat.
- Với các hành động cần tài khoản AWS, domain, email provider, SMS provider hoặc Cloudflare, hãy chỉ rõ phần tôi phải cấu hình.
- Nếu môi trường có quyền chỉnh sửa mã nguồn thì hãy trực tiếp thực hiện.
- Nếu môi trường không có quyền sửa repository hoặc chạy lệnh, phải nêu rõ giới hạn và cung cấp patch/file cần thiết, không giả vờ đã hoàn thành.
- Nếu công việc quá lớn cho một lần thực hiện, hoàn thành từng giai đoạn thật sự, không chỉ lập kế hoạch rồi dừng.

**BẮT ĐẦU NGAY:**

1. Kiểm tra repository `https://github.com/ngocdien13/ATTT`.
2. Phân tích chính xác cấu trúc và tình trạng dự án.
3. Đề xuất kiến trúc cuối cùng, migration và thứ tự triển khai.
4. Sau đó bắt đầu thực hiện Giai đoạn 1 và tiếp tục lần lượt các giai đoạn.
5. Giữ đầy đủ lịch sử mã hóa và khả năng tương thích với Seruchat hiện tại.
