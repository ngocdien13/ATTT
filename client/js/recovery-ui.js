"use strict";
let recoveryConfigured = false,
  recoveryPending = null,
  recoveryMode = "pin",
  recoveryDeadline = 0,
  recoveryBusy = false;
async function recoveryApi(url, body) {
  const r = await fetch(
    "/api/recovery/" + url,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": await csrfToken(),
          },
          body: JSON.stringify(body),
        },
  );
  const d = await r.json();
  if (!r.ok) {
    const e = Error(d.message);
    e.retryAfter = d.retryAfter || 0;
    e.status = r.status;
    throw e;
  }
  return d;
}
function recoveryComplete(pair, expected) {
  const pending = recoveryPending;
  if (!pending || pending !== expected) return;
  recoveryPending = null;
  el("recoveryDialog").close();
  el("recoveryForm").reset();
  el("recoveryCode").textContent = "";
  pending.password = null;
  pending.prepared = null;
  pending.resolve(pair);
}
function recoveryDisplay(setup) {
  el("recoveryTitle").textContent = setup
    ? "Bảo vệ lịch sử trò chuyện"
    : "Khôi phục cuộc trò chuyện";
  el("recoveryDescription").textContent = setup
    ? "Tạo PIN riêng để mở lịch sử khi đăng nhập trên thiết bị mới. Hãy dùng mã khác mật khẩu đăng nhập."
    : "Nhập PIN bạn đã tạo để mở lịch sử trên trình duyệt này.";
  el("recoverySetup").hidden = !setup;
  el("recoveryUnlock").hidden = setup;
  el("recoverySave").hidden = true;
  el("recoverySubmit").hidden = false;
  el("recoverySubmit").textContent = setup ? "Tiếp tục" : "Khôi phục";
  el("recoveryStatus").textContent = "";
  el("recoverySubmit").disabled = false;
  el("recoveryPassword").required = setup && !recoveryPending.password;
  el("recoveryPasswordField").hidden = !setup || !!recoveryPending.password;
  el("recoveryPin").required = setup;
  el("recoveryPinConfirm").required = setup;
  el("recoveryValue").required = !setup;
  el("recoverySaved").required = false;
  el("recoverySaved").checked = false;
  if (!el("recoveryDialog").open) el("recoveryDialog").showModal();
  (setup ? el("recoveryPin") : el("recoveryValue")).focus();
}
async function openChatRecovery(user, password, forceSetup = false) {
  const state = await recoveryApi("status");
  recoveryConfigured = state.configured;
  state.pinUntil = Date.now() + (state.retryAfter || 0) * 1000;
  state.codeUntil = Date.now() + (state.codeRetryAfter || 0) * 1000;
  let pair = await getKeyPair(user.id);
  if (
    pair &&
    state.publicKey &&
    (await exportPublicKey(pair.publicKey)) !== state.publicKey
  )
    pair = null;
  if (pair) await validateChatKeyPair(pair);
  if (state.configured && pair && !forceSetup) return pair;
  if (!state.configured && !pair) {
    if (!state.hasKey) {
      pair = await generateKeyPair();
      await saveKeyPair(user.id, pair);
    } else if (state.legacy && password) {
      try {
        pair = await setupChatKey(user.id, password);
      } catch {}
    }
  }
  return new Promise((resolve, reject) => {
    recoveryMode = "pin";
    recoveryDeadline = 0;
    recoveryPending = {
      user,
      state,
      pair,
      password,
      resolve,
      reject,
      forceSetup,
    };
    el("recoveryForm").reset();
    el("recoveryLegacy").hidden = !!pair || state.configured;
    el("recoveryLegacyPassword").required = !pair && !state.configured;
    recoveryDisplay(!state.configured || forceSetup);
    setRecoveryMode("pin");
    if (state.retryAfter && !forceSetup)
      recoveryDeadline = Date.now() + state.retryAfter * 1000;
  });
}
function setRecoveryMode(mode) {
  recoveryMode = mode;
  const isPin = mode === "pin";
  el("recoveryValue").value = "";
  el("recoveryValueLabel").textContent = isPin
    ? "PIN 8 chữ số"
    : "Mã khôi phục";
  el("recoveryValue").inputMode = isPin ? "numeric" : "text";
  el("recoveryValue").maxLength = isPin ? 8 : 80;
  el("recoveryValue").pattern = isPin ? "[0-9]{8}" : "[0-9a-fA-F\\s-]{64,80}";
  el("recoveryAlternative").textContent = isPin
    ? "Dùng mã khôi phục"
    : "Dùng PIN";
  if (recoveryPending) {
    recoveryDeadline =
      recoveryPending.state[isPin ? "pinUntil" : "codeUntil"] || 0;
  }
}
el("recoveryAlternative").onclick = () => {
  setRecoveryMode(recoveryMode === "pin" ? "code" : "pin");
  el("recoveryStatus").textContent = "";
};
el("recoveryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = recoveryPending,
    b = el("recoverySubmit"),
    method = recoveryMode;
  if (!p || b.disabled || recoveryBusy) return;
  recoveryBusy = true;
  b.disabled = true;
  el("recoveryAlternative").disabled = true;
  el("recoveryStatus").textContent = "Đang xử lý…";
  try {
    if (p.prepared) {
      await recoveryApi("configure", p.prepared);
      recoveryConfigured = true;
      recoveryComplete(p.pair, p);
      return;
    }
    if (!p.state.configured || p.forceSetup) {
      const pin = el("recoveryPin").value;
      RecoveryCrypto.validatePin(pin);
      if (pin !== el("recoveryPinConfirm").value)
        throw Error("Hai PIN chưa khớp.");
      if (pin === p.password || pin === el("recoveryPassword").value)
        throw Error("PIN cần khác mật khẩu đăng nhập.");
      if (!p.pair) {
        p.pair = await setupChatKey(
          p.user.id,
          el("recoveryLegacyPassword").value,
        );
        el("recoveryLegacyPassword").value = "";
      }
      const pub = await exportPublicKey(p.pair.publicKey),
        prep = await recoveryApi("prepare", {
          password: p.password || el("recoveryPassword").value,
          publicKey: pub,
        });
      if (recoveryPending !== p) return;
      p.password = null;
      const pm = await RecoveryCrypto.pinMaterial(pin, prep.salt),
        code = RecoveryCrypto.newCode(),
        cm = await RecoveryCrypto.codeMaterial(code);
      try {
        const pinWrap = await RecoveryCrypto.seal(
          p.pair,
          pm,
          prep.gate,
          p.user.id,
          pub,
          prep.id,
          "pin",
        );
        const codeWrap = await RecoveryCrypto.seal(
          p.pair,
          cm,
          null,
          p.user.id,
          pub,
          prep.id,
          "code",
        );
        // Check both recovery paths locally before deleting the previous backup on the server.
        await validateChatKeyPair(
          await RecoveryCrypto.open(
            pinWrap,
            pm,
            prep.gate,
            p.user.id,
            pub,
            prep.id,
            "pin",
          ),
        );
        await validateChatKeyPair(
          await RecoveryCrypto.open(
            codeWrap,
            cm,
            null,
            p.user.id,
            pub,
            prep.id,
            "code",
          ),
        );
        const data = {
          id: prep.id,
          publicKey: pub,
          pinProof: pm.proof,
          codeProof: cm.proof,
          pinWrap,
          codeWrap,
        };
        p.prepared = {
          ...data,
          ownership: await RecoveryCrypto.ownership(
            p.pair,
            prep.challengePublic,
            data,
          ),
        };
      } finally {
        pm.secret.fill(0);
        cm.secret.fill(0);
      }
      if (recoveryPending !== p) return;
      el("recoveryCode").textContent = code;
      el("recoverySetup").hidden = true;
      el("recoverySave").hidden = false;
      for (const id of [
        "recoveryPin",
        "recoveryPinConfirm",
        "recoveryPassword",
        "recoveryLegacyPassword",
      ]) {
        el(id).value = "";
        el(id).required = false;
      }
      el("recoverySaved").required = true;
      el("recoveryTitle").textContent = "Giữ mã khôi phục của bạn";
      el("recoveryDescription").textContent =
        "Cất mã này ở nơi an toàn, tách khỏi mật khẩu. Bạn có thể dùng mã khi quên PIN. Mã chỉ được hiển thị lúc này.";
      el("recoverySubmit").textContent = "Hoàn tất";
      el("recoveryStatus").textContent = "";
      return;
    }
    const m =
      method === "pin"
        ? await RecoveryCrypto.pinMaterial(
            el("recoveryValue").value,
            p.state.salt,
          )
        : await RecoveryCrypto.codeMaterial(el("recoveryValue").value);
    try {
      const d = await recoveryApi("unlock", {
        method,
        version: p.state.version,
        proof: m.proof,
      });
      const pair = await RecoveryCrypto.open(
        d.wrap,
        m,
        d.gate,
        p.user.id,
        p.state.publicKey,
        d.version,
        method,
      );
      await validateChatKeyPair(pair);
      if (recoveryPending !== p) return;
      await saveKeyPair(p.user.id, pair);
      recoveryComplete(pair, p);
    } finally {
      m.secret.fill(0);
    }
  } catch (error) {
    if (recoveryPending !== p) return;
    if (error.retryAfter) {
      recoveryDeadline = Date.now() + error.retryAfter * 1000;
      p.state[method === "pin" ? "pinUntil" : "codeUntil"] = recoveryDeadline;
    }
    el("recoveryStatus").textContent =
      error.name === "OperationError"
        ? "Không mở được lịch sử. Vui lòng kiểm tra mã và thử lại."
        : error.message;
    if (error.status === 409 && p.prepared) {
      p.prepared = null;
      recoveryDisplay(true);
    }
  } finally {
    recoveryBusy = false;
    el("recoveryAlternative").disabled = false;
    if (recoveryPending === p) b.disabled = recoveryDeadline > Date.now();
  }
});
el("recoveryCopy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(el("recoveryCode").textContent);
    el("recoveryStatus").textContent = "Đã sao chép. Hãy lưu vào nơi an toàn.";
  } catch {
    el("recoveryStatus").textContent =
      "Bạn có thể chọn và sao chép mã bên trên.";
  }
};
el("recoveryDownload").onclick = () => {
  const blob = new Blob(
      [
        "Seruchat — mã khôi phục\n" +
          el("recoveryCode").textContent +
          "\nKhông chia sẻ mã này.\n",
      ],
      { type: "text/plain;charset=utf-8" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "seruchat-ma-khoi-phuc.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
el("recoveryDialog").addEventListener("cancel", (e) => e.preventDefault());
el("recoveryLogout").onclick = async () => {
  const p = recoveryPending;
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } finally {
    clearSession();
    p?.reject(new CancelledAction());
  }
};
window.addEventListener("seruchat-clear", () => {
  const p = recoveryPending;
  recoveryPending = null;
  recoveryConfigured = false;
  el("recoveryDialog").close();
  el("recoveryForm").reset();
  el("recoveryCode").textContent = "";
  p?.reject(new CancelledAction());
});
el("changeRecoveryPin").onclick = async () => {
  el("profileDialog").close();
  try {
    await openChatRecovery({ id: currentUserId.textContent }, null, true);
    notice("Đã cập nhật PIN và mã khôi phục.");
  } catch (e) {
    report(e);
  }
};
setInterval(() => {
  if (!recoveryPending || recoveryPending.prepared) return;
  const seconds = Math.max(
    0,
    Math.ceil((recoveryDeadline - Date.now()) / 1000),
  );
  if (seconds) {
    el("recoverySubmit").disabled = true;
    el("recoveryCountdown").textContent =
      "Thử lại sau " +
      (seconds < 60 ? seconds + " giây" : Math.ceil(seconds / 60) + " phút") +
      ".";
  } else {
    el("recoveryCountdown").textContent = "";
    if (!recoveryBusy && el("recoverySubmit").dataset.waiting === "true")
      el("recoverySubmit").disabled = false;
  }
  el("recoverySubmit").dataset.waiting = String(!!seconds);
}, 250);
