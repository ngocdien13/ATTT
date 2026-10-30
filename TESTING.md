> **Bản cập nhật Phase4–5:** nhóm E2EE và file mã hóa đã có code. Đọc [hướng dẫn chạy](docs/PHASE4_5_QUICKSTART.md), [bàn giao](docs/PHASE4_5_DELIVERY.md), [giao thức v2](E2EE_PROTOCOL.md) và [tiến độ](docs/IMPLEMENTATION_STATUS.md). Mốc Phase1/2 bên dưới được giữ để đối chiếu lịch sử.

## UI + PIN verification — 2026-10-30

- Real MySQL 8.0.46 / Node 24: **66 passed, 0 failed, 0 skipped**. Includes bootstrap of an empty database, repeated startup preserving data, the real startup entry process and health check, missing recovery-master refusal, legacy regressions, CSRF, private-key ownership, PIN/code recovery, concurrent failed attempts, per-account escalating waits and code fallback, rotation and password changes.
- Chromium / Playwright: legacy + Java compatibility and full groups/files suites. Added ten consecutive Enter sends with receiver delivery, stable message/list DOM across polling, draft/scroll preservation, PIN-required fresh contexts, five failures with countdown surviving reload, code fallback and trusted-browser reload.
- Dependency audit (`npm audit --omit=dev`): zero known vulnerabilities at verification time. This is not a protocol audit.
- Original three browser crypto files, Java sources, baseline schema and migrations 001–004 are unchanged.
- Linux headless browser and MySQL were exercised. Windows START.cmd and first-run interactive prompts were reviewed but not executed on a Windows host. No real email/SMS Internet service, Admin, AWS, production restore or independent security audit is claimed.

Evidence: `docs/verification/polish-tests.log`, `polish-browsers.log`, `polish-audit.json`. Reproduce API tests with `RUN_MYSQL_TESTS=1 npm test` in `server` against a dedicated test MySQL account allowed to create/drop temporary random test databases. Browser suites: `npm ci` then `npm test` in `server/e2e` with the same database credentials; Playwright Chromium and JDK 21 are required. Never point test credentials at a production database user.

The final browser run logged two transient backend ETIMEDOUT errors; subsequent requests recovered and all assertions passed. No load/reliability certification is claimed.

The following sections retain verification history from earlier phases.


> **Bản tiếp nối Phase 2 + UI nền Phase 3:** xem [hướng dẫn chạy](docs/PHASE2_QUICKSTART.md), [tiến độ](docs/IMPLEMENTATION_STATUS.md) và [bàn giao](docs/PHASE2_DELIVERY.md). Các mục Phase 1 bên dưới là mốc trước nâng cấp.

# Kiểm thử thực chạy — Giai đoạn 1

Ngày 29/10/2026; môi trường riêng, không kết nối dữ liệu Windows/AWS của người dùng. Nguồn baseline 7f2894fcceb1b960e47613b561eac200b78cb58b. Runtime: Node.js 24.22.1, MySQL 8.0.46, JDK21; E2E dùng Playwright1.62.1/Chromium153. Migration CI dùng MySQL8.4 nhưng workflow chưa chạy trên GitHub.

## Kết quả

| Kiểm tra đã chạy | Kết quả |
|---|---|
| npm test trước sửa trên nguồn baseline | Lỗi hash các primitive ngay ở nguồn gốc; xem log baseline-unit và BASELINE_ANALYSIS B01. Không ghi baseline là toàn bộ PASS |
| RUN_MYSQL_TESTS=1 npm test sau sửa | **26 passed, 0 failed, 0 skipped** |
| Browser + MySQL + HTTP thật | PASS: đọc recipient/self lịch sử seed trước migration; gửi tiếng Việt/emoji; No giữ bản nháp và không thêm row |
| Sửa ciphertext đã nằm trong cache | PASS: mất plaintext, báo không giải mã; khôi phục row gốc đọc lại được |
| Profile trình duyệt mới | PASS: password mở backup v1, khôi phục đúng identity và đọc lịch sử cũ |
| Java | PASS: biên dịch 3 file; Java Sender → web và web → Java Receiver đúng tiếng Việt |
| Page errors | Không có trong các trang được theo dõi |
| Bảo toàn nguồn/SQL | git diff với baseline: ba file Web Crypto, Java clients và hai schema khởi tạo không thay byte |
| Dependency audit production | Trước 4 mục (2 high/2 moderate); sau **0 cảnh báo đã biết**. Đây không phải chứng minh không có lỗ hổng |

Không chạy thử AWS, Turnstile/email/SMS provider hoặc PIN/recovery v2; không có credentials/domain để tuyên bố các phần đó hoạt động. Chưa có test cho tính năng tương lai chưa được code.

## Các ranh giới migration đã kiểm tra

- Status chỉ đọc; check từ chối pending.
- Hai tiến trình/kết nối migration serialize bằng advisory lock, không backfill trùng.
- Chạy up lần hai là no-op; giữ nguyên row messages/public key.
- Schema bảy bảng chưa có blocked_previous_status được nâng đúng; Safe Updates bật vẫn hoàn tất và được khôi phục.
- Username trùng không mất dữ liệu; handles backfill khác nhau, DOB/phone_verified để NULL.
- Sửa/mất file migration đã chạy bị từ chối.
- DDL đã commit rồi lỗi vẫn đánh dấu failed; retry tự động bị chặn, resume cần đúng version/checksum và điều kiện đã được người vận hành kiểm tra.
- Readiness trả503 trước migration, 200 sau migration.
- Khôi phục backup có private key không tương ứng public key bị từ chối trước ghi IndexedDB.
- Logout/đổi chat không để tác vụ giải mã cũ nạp lại plaintext cache; cache giới hạn số entry.

## Tự chạy unit và integration

PowerShell, tại server (Node24, MySQL8; .env đúng DB_HOST/PORT/USER/PASSWORD):

```powershell
npm.cmd ci
npm.cmd test
$env:RUN_MYSQL_TESTS = '1'
npm.cmd test
Remove-Item Env:RUN_MYSQL_TESTS
```

Nếu không bật RUN_MYSQL_TESTS, hai nhóm kiểm thử MySQL sẽ SKIP; không được gọi kết quả đó là đã kiểm tra DB. Integration tự tạo database tên seruchat_test_* và seruchat_migrations_* rồi xóa chúng; dùng tài khoản test có CREATE/DROP database, không dùng credential production. Source test không đọc/sửa DB_NAME của ứng dụng làm dữ liệu test.

## Tự chạy E2E browser/Java

Cài JDK21 và bảo đảm java/javac có trong PATH. Từ thư mục server:

```powershell
cd e2e
npm.cmd ci
npx.cmd playwright install chromium
# Điền DB_HOST/DB_PORT/DB_USER/DB_PASSWORD cho MySQL thử nghiệm nếu không dùng mặc định localhost/root.
npm.cmd test
```

Bài test dùng database seruchat_e2e_<random> riêng, seed hai account/key test, nâng migration, chạy browser thật và Java thật, rồi dọn database/thư mục test. Không dùng mock API production. Tài khoản DB test cần CREATE/DROP. Không dùng credentials MySQL thật của production ở CI.

JAVA_BIN/JAVAC_BIN cho phép chỉ định executable nếu chưa có PATH. E2E_BROWSER_PATH dùng binary Chromium tương thích khi môi trường có sẵn. E2E_NO_SANDBOX=1 chỉ phục vụ môi trường test container chạy root; web security không bị tắt, script từ chối các cờ disable-web-security/allow-running-insecure-content. E2E_BROWSER_ARGS là JSON cho môi trường Chromium đặc thù; Windows thông thường không cần cấu hình.

## Evidence

- docs/verification/baseline-unit.log
- docs/verification/phase1-tests.log
- docs/verification/phase1-e2e.log
- docs/verification/audit-before.json, audit-after.json

Các log chỉ chứa kết quả test/đường dẫn code, không chứa mã recovery hoặc private key thật. Workflow .github/workflows/tests.yml có sẵn cho lần push/PR tiếp theo; chưa tuyên bố workflow đã chạy. Bộ kiểm thử không thay thế pentest hoặc đánh giá mật mã của protocol mới.

## Bản tiếp nối Phase 2 + UI nền Phase 3

- **38/38 tests pass, 0 skipped** khi bật `RUN_MYSQL_TESTS=1`: account lifecycle mới, SMTP cục bộ thật, DOB/VN phone/Gmail alias, privacy/avatar, OTP attempts/expiry/ownership, session IDOR/revoke, atomic password/backup rewrap, reset preserve backup, CSRF (kể cả token Unicode sai), durable throttle; regression legacy/ledger và cursor microseconds.
- **Browser + Java E2E PASS**: migration không sửa legacy rows; người nhận/người gửi đọc đúng; No giữ draft; GCM tamper không dùng plaintext cache cũ; fresh browser restore; Java compile/send/receive với web; sửa profile + avatar qua UI; đổi mật khẩu rồi thiết bị mới đọc lịch sử cũ; đăng ký/tìm handle; theme; mobile390px không tràn ngang; emoji/client search; không có page errors.
- **npm ci** thực chạy lại thành công. **npm audit --omit=dev**: 0 known vulnerabilities tại lần kiểm tra; không có nghĩa toàn bộ hệ thống không có lỗ hổng.
- Môi trường thực chạy: Node24.22.1, MySQL8.0.46, Chromium153 qua Playwright1.62.1, JDK21. Tắt browser sandbox chỉ vì test container root, không tắt web security. SMTP server cục bộ nhận thư thật qua TCP; không phải email Internet. Twilio transport có unit test mock fetch; OTP có HTTP/MySQL tests, chưa SMS thật.
- Logs cuối: `docs/verification/phase2-tests.log`, `phase2-e2e.log`, `phase2-audit.json`. Không đưa password/OTP token hay private key vào log.

Chạy (thư mục `server`):

```sh
npm ci
npm test
```

Nếu không đặt RUN_MYSQL_TESTS=1 thì các bài MySQL được **skip**, không tính là full pass. Dùng MySQL test riêng có quyền tạo/xóa database random, không dùng user/database production:

PowerShell:
```powershell
$env:RUN_MYSQL_TESTS="1"
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
npm test
```

Ubuntu:
```bash
RUN_MYSQL_TESTS=1 DB_HOST=127.0.0.1 DB_PORT=3306 npm test
```

E2E (cần database test/JDK/Chromium; không chạy tài khoản thật):
```sh
cd e2e
npm ci
npx playwright install chromium
npm test
```

DB_HOST/DB_PORT/DB_USER/DB_PASSWORD truyền qua môi trường của terminal. JAVA_BIN/JAVAC_BIN tùy chọn nếu Java chưa trong PATH. Script tạo database ngẫu nhiên và xóa chính database đó ở cuối. Không có triển khai AWS/Cloudflare/HTTPS hai mạng thật để báo pass trong đợt này.

## Bản cập nhật Phase4–5 — kết quả mới nhất

**55/55 tests,0failed,0skipped** với RUN_MYSQL_TESTS=1. Gồm các bài cũ và crypto v2/roster/file, HTTP/MySQL/storage, quota race,10MB boundary, orphan cleanup. Nhóm3/10/20 được kiểm thử crypto với roster/invitations đã ký; không tuyên bố20 browser đồng thời hoặc load test production.

**Groups/files browser E2E PASS**: ba context đăng nhập độc lập, create/invite/accept, exclusion history cũ, textemoji, file nhóm/direct và download đúng bytes; PNG/JPEG/WebP preview và fake SVG rejection; ciphertext/header tamper làm mất plaintext cache cũ; pinned key substitution bị chặn; rename/removal; former member không tải file mới nhưng còn file cũ; fresh browser signing restore;390px không tràn ngang; không page errors. Có thêm kiểm tra download trả quá signed byte count và binary bị sửa, sau đó retry bản gốc thành công.

**Legacy browser/Java E2E PASS**: history/key cũ, cache tamper, Java↔web, Phase2 profile/avatar/password/fresh-device restore. Các file crypto v1/Java/schema cũ/migration001/002 so byte với bản Phase2 không đổi.

**npm ci + build:v2 thực chạy thành công; npm audit --omit=dev:0known vulnerabilities** tại lần kiểm tra. Các kết quả này không chứng minh application protocol không có lỗi; chưa audit độc lập hoặc triển khai AWS/HTTPS Internet.

Logs cuối ở docs/verification/phase45-tests.log, phase45-groups-e2e.log, phase45-legacy-e2e.log, phase45-audit.json. Cấu hình môi trường tương tự Phase2: Node24, MySQL8.0.46, Chromium153/Playwright1.62.1, JDK21. Database/tempfiles test ngẫu nhiên được dọn ở finally, không dùng tài khoản hay dữ liệu production.

Backend:
```sh
npm ci
npm run build:v2
npm test
```

Full MySQL: bật RUN_MYSQL_TESTS=1 và DB_HOST/PORT/USER/PASSWORD trong terminal test như phần trước. Không bật thì MySQL tests skip, không tính full pass.

Browser (thư mục server/e2e, có MySQL test/JDK/Chromium):
```sh
npm ci
npx playwright install chromium
npm run test:legacy
npm run test:groups
```

npm test trong e2e chạy cả hai. E2E_BROWSER_PATH/E2E_BROWSER_ARGS tùy môi trường; script từ chối disable-web-security/allow-running-insecure-content. E2E_NO_SANDBOX chỉ dùng cho container kiểm thử root, không hướng dẫn tắt bảo mật browser người dùng. CLI npm run cleanup không xóa file attach; integration test đã kiểm tra orphan/temp bị dọn và file attach còn nguyên.
