# Dependencies mật mã v2

- @hpke/core1.9.0: MIT, dajiaji/hpke-js. X25519/HKDF-SHA256/AES256GCM HPKE qua WebCrypto, upstream có RFC9180 test vectors. Đợt này chạy tests application protocol/roundtrip/tamper; không tuyên bố tự audit thư viện hoặc chạy toàn bộ upstream test suite. License ở licenses/hpke-core-LICENSE.txt.
- json-canonicalize3.0.1: MIT, cyberphone/json-canonicalization-compatible canonical JSON implementation package; dùng canonicalization để Node/browser ký cùng bytes. License ở licenses/json-canonicalize-LICENSE.md. Source: https://github.com/snowyu/json-canonicalize.ts .
- esbuild0.28.2: MIT, build-time tool. Không tải runtime script từ CDN; build dùng dependencies pinned ở server/package-lock.json. Các dependencies khác như Phase2 giữ thông tin license trong package của chúng.

Bundle client/js/vendor/secure-v2.js chứa mã từ các package trên và comments license do esbuild giữ lại; không sửa bundle bằng tay. Chạy npm run build:v2 để tạo lại từ server/src/crypto/secure-v2.mjs. Ed25519 và AES-GCM content dùng implementation WebCrypto của browser/Node.

## Tài nguyên giao diện theo ảnh tham chiếu

- Roboto variable font: Google Fonts, https://github.com/google/fonts/tree/main/ofl/roboto . Chuyển định dạng TTF sang WOFF, giữ nguyên font/chữ tiếng Việt; SIL Open Font License 1.1 đi kèm tại `licenses/Roboto-OFL.txt`. Phục vụ cục bộ ở `client/fonts/roboto.woff`.
- Họa tiết nền: `client/assets/telegram-pattern.svg`, bản SVG từ Telegram Web K, https://github.com/TelegramOrg/Telegram-web-k/blob/master/public/assets/img/pattern.svg . Nguồn upstream GPL v3, bản giấy phép đi kèm tại `licenses/Telegram-Web-K-GPL-3.txt`; giữ SVG nguồn và attribution. Không lấy ảnh chụp chứa dữ liệu tài khoản để làm asset.
- `client/ui-icons.svg`: icon nét mảnh được viết cho giao diện Seruchat. Layout/menu/CSS được triển khai trong repo; không nhúng hoặc tải mã thực thi Telegram Web.
