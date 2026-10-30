> Tài liệu bản UI/PIN trước. Bản hiện hành: README, TELEGRAM_PHASE6_8.md và SECURITY_MODEL.md. Vị trí tệp mặc định hiện xác định rõ là server/.data/encrypted-files; giữ ATTACHMENT_DIR nếu đã cấu hình.

# PIN recovery and UI polish

This document supersedes earlier password-only recovery and manual startup instructions. Original browser X25519/HKDF/AES-GCM v1 crypto bytes and Java protocol remain compatible. No deployed environment or real user database was modified during development.

## User flow

New registration does not bundle a PIN into the password form. After successful login (and email verification when required), onboarding creates a distinct 8-digit PIN, asks for confirmation, displays a 256-bit random recovery code, and requires acknowledgment before chat opens. Existing users are enrolled with the same X25519 identity: local key or old password backup is opened first. Server deletion of the password backup and new vault creation happen in one transaction. Interrupted onboarding leaves the previous backup unchanged.

Already trusted browsers use their IndexedDB key after login. A browser without that key must use PIN or recovery code; no automatic password-only restore after enrollment. User/profile/group membership metadata is available to the authenticated account and is not encrypted history. Only messages addressed to that identity can be decrypted; new group members cannot read older messages. Leaving/removal does not revoke already delivered keys.

Settings allows PIN/code replacement with current-password reauthentication plus a proof of possession of the original X25519 private key. It preserves encryption/signing identities and ciphertext. Fresh devices cannot overwrite the vault using only a stolen login password. A prepared setup expires after 10 minutes and is bound to the previous vault version, so competing rotations fail closed. No cross-device approval/push workflow is implemented.

## Protocol (version 1)

Client uses Web Crypto only. Salt: 32 random bytes; PIN: 8 ASCII digits, with repeated/sequential PINs rejected by the UI. PBKDF2-HMAC-SHA256 with 600,000 iterations derives 64 bytes. First 32 bytes are client encryption material; last 32 bytes are the authentication proof. The server receives the proof, **not** the PIN or the first 32 bytes. An 8-digit PIN is still a low-entropy secret; no claim of equivalence to a high-entropy key or to Messenger's protocol is made.

Server creates a random 32-byte gate secret at prepare time. Client derives a wrapping key using HKDF-SHA256(input=client encryption material, salt=gate secret, info=`seruchat/recovery/pin/v1`). AES-256-GCM wraps the existing X25519 PKCS8 key with a fresh 12-byte IV. AAD is fixed-order JSON `{domain:'seruchat/recovery/v1',userId,publicKey,version,kind:'pin'}`. The gate secret is released only after successful PIN proof verification.

The server derives separate 32-byte `proof` and `gate` subkeys from `RECOVERY_MASTER_KEY` using HKDF-SHA256, zero salt, info `seruchat/recovery/master/{purpose}/v1`. The authentication proof is HMAC-SHA256 peppered under the `proof` subkey with a domain/user binding, then Argon2id hashed (64 MiB, 3 passes, p=1). The gate secret is encrypted AES-256-GCM under the `gate` subkey with a fresh IV and user-bound domain AAD. Only verifier, encrypted gate, client ciphertext and salts are in the database. `RECOVERY_MASTER_KEY` must be stored separately from database backups and provisioned through a secrets manager in production. Local startup generates it once in `.env`, and refuses regeneration when an existing vault needs a missing key.

Recovery code: 32 random bytes represented as grouped hex. Its encryption key is HKDF-SHA256(code bytes, zero salt, info=`seruchat/recovery/code/v1`). Its proof is SHA256(`seruchat/recovery/code-auth/v1\0` + lowercase ungrouped hex); the server stores only a domain/user-bound HMAC under the `proof` subkey. Code wrapping uses independent key/IV and AAD kind=`code`. Full code is displayed only during setup. Both PIN and code copies are locally decrypted and key-matched before upload.

Prepare uses password reauthentication, then an ephemeral X25519 challenge against the already registered public key (or candidate key for an account with no identity). The session stores the derived challenge shared secret for 10 minutes. Configure must HMAC-SHA256 authenticate fixed-order JSON `{id,publicKey,pinProof,codeProof,pinWrap,codeWrap}` using that shared secret. This proves private-key possession and binds the exact uploaded backups. The same authenticated user cannot replace an existing identity.

All new recovery writes require session and CSRF. No raw PIN, recovery code, gate or plaintext private key is logged. No ordinary UI exposes protocol version, roster counter or cipher suite. A recovery code is a reusable emergency secret until rotation, **not** a single-use MFA code. After using it, rotate PIN/code in settings if its confidentiality is uncertain.

## Throttling

Per-account counters and deadlines are persisted in `recovery_vaults`, serialized with `SELECT ... FOR UPDATE`; errors commit failure counts. Failures 1–4 have no additional wait; 5:30s, 6:60s, 7:300s, 8:900s, 9:3600s, 10+:21600s. Attempts while waiting neither verify nor extend the deadline. A correct attempt after expiry resets that method's counter. PIN and recovery-code methods have separate counters so emergency recovery is available during PIN lockout. IP throttling supplements these controls. UI countdown reflects server deadlines and persists through reload/new sessions; UI timing is not the enforcement boundary.

## Threat model and limits

Database-only theft does not supply the master pepper/gate key, so PIN guessing against its verifier/wrapper alone is blocked. If an attacker also obtains the master key, or controls the live server, low-entropy PINs can be attacked offline. A live compromised server can serve malicious JavaScript and steal endpoint secrets; this remains a browser E2EE limitation. This is a pragmatic server-assisted PIN design using standard primitives, **not** an audited PAKE/OPAQUE, HSM or distributed recovery system. Do not describe it as independently audited or maximally secure. PIN is a recovery secret, not account-login MFA. The account session can still read ciphertext/metadata before recovery.

IndexedDB persists keys on trusted browsers; signing identity is still encrypted under material derived from the same X25519 key. Logout revokes the account session but deliberately retains local key storage. There is no per-page local PIN lock. Old password-only backups in historical database snapshots remain password-recoverable and must be managed under the deployment's backup retention policy.

Losing PIN, recovery code and every local key loses history. Losing server `.env`/master key breaks the online recovery verifier; restore the same secret from an independently protected backup. Attached binary files must be backed up with the database, outside the public directory. No production backup restore or Windows GUI installation is claimed as tested in this environment.

## UI and logic

Snap-inspired yellow/black navigation rail, compact chat rows with avatar initials, rounded composer, light/dark themes, mobile navigation and chat view. No camera/stories/calls are implied. Enter sends; Shift+Enter inserts a line; IME composition is respected. Confirmation remains for destructive actions, password changes and ownership transfer; normal login/open/send does not require extra dialogs.

Unchanged list responses do not rebuild lists. Message rendering updates only new/modified records, preserving existing file cards, scroll and input. Ciphertext edits still invalidate cached plaintext. Polling remains 2.5s for direct and 4s for groups, with overlap guards and pauses for hidden documents; there is no WebSocket server in this release. Polling means receipt is not instantaneous. Group send finally restores button state, preserves a draft on error and avoids clearing a newer draft. Concurrent sends during stale membership return a retryable error, never silently publish with an obsolete roster.

A group row lock serializes invitation creation; the server rejects a duplicate unexpired pending invite for that group/person. Migration 005 rejects older duplicate pending rows without deleting groups/messages. Group invitations accepted/rejected update the lists. In an existing group with the owner as sole member, transfer to another member is needed before leaving; group deletion/closure is not implemented. The UI explains this instead of offering an apparently working leave action.

## Startup / data

`node start.js` at repository root installs locked dependencies if needed, then invokes `server/tools/start.js`. The latter reads or guides local `.env` setup, creates only the configured database if absent, bootstraps its baseline when empty, applies migrations under named locks, checks schema and starts Express. A corrupt/partial/mismatched migration fails closed; manual repair is an operator task, not an ordinary user flow. It does not drop/rename databases or reset data. Production needs explicit secrets and HTTPS/reverse proxy; no AWS deployment was performed.

Three redundant SQL entry files were removed. Only `database/schema.sql` and internal ordered migrations remain; the application still uses one database. Applied migrations 001–004 are unchanged. Old documentation remains as phase history; current README is the canonical local-run guide.

## References

- OWASP Authentication Cheat Sheet, account-bound throttling and lockout abuse: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Password Storage Cheat Sheet, Argon2id, PBKDF2 and separate pepper: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Cryptographic Storage Cheat Sheet, key/data separation: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html

These sources guide individual controls; they do not endorse or audit this project's protocol.

## Verification result

Real MySQL/Node run: 66/66 passed, no skips. The bootstrap test starts the real server entry point and checks readiness with data preserved. Both browser suites passed against the final implementation, including Java/web compatibility and ten successive group sends. There were no browser page errors. One final browser run recorded two transient backend `ETIMEDOUT` errors and recovered on subsequent requests; passing these checks is not a load/reliability certification. Production dependency audit reported zero known vulnerabilities. Evidence is under `docs/verification/polish-*`. No production environment or real user data was used.
