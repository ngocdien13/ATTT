"use strict";
let ownProfile = null,
  phoneChallenge = null,
  accountMode = "email",
  linkData = null;
async function csrfToken() {
  const r = await fetch("/api/auth/csrf");
  const d = await r.json();
  if (!r.ok) throw new Error(d.message);
  return d.token;
}
async function accountApi(url, body, method = "POST") {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            ...(ready ? { "X-CSRF-Token": await csrfToken() } : {}),
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && ready) clearSession();
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  return data;
}
function accountWork(id, work, target = "profileStatus") {
  el(id).addEventListener(
    el(id).tagName === "FORM" ? "submit" : "click",
    async (e) => {
      e.preventDefault();
      const node = el(id),
        b =
          node.tagName === "FORM"
            ? node.querySelector("button[type=submit]")
            : node;
      if (b.disabled) return;
      b.disabled = true;
      el(target).textContent = "Đang xử lý…";
      try {
        await work();
      } catch (error) {
        el(target).textContent = error.message;
      } finally {
        b.disabled = false;
      }
    },
  );
}
async function loadProfile() {
  const mine = currentUserId.textContent;
  const { profile: p } = await accountApi("/api/profiles/me");
  if (!ready || mine !== currentUserId.textContent) return;
  ownProfile = p;
  el("username").textContent = p.displayName;
  userCache.set(p.id, p.displayName);
  el("userEmail").textContent = "@" + p.handle + " · " + p.email;
  el("myAvatar").hidden = !p.avatarUrl;
  if (p.avatarUrl) el("myAvatar").src = p.avatarUrl;
  else el("myAvatar").removeAttribute("src");
  for (const [field, value] of Object.entries({
    profileName: p.displayName,
    profileHandle: p.handle,
    profileBirth: p.dateOfBirth,
    profilePhone: p.phone,
    profileBio: p.bio,
  }))
    el(field).value = value || "";
  el("profileShowPhone").checked = p.showPhone;
  el("profileShowBirth").checked = p.showBirthday;
  el("verificationState").textContent =
    `Email: ${p.emailVerified ? "đã xác minh" : "chưa xác minh"} · Số điện thoại: ${p.phoneVerified ? "đã xác minh" : "chưa xác minh"}.`;
  el("resendEmail").disabled = p.emailVerified;
  el("sendPhone").disabled = !p.phone || p.phoneVerified;
}
async function loadSessions() {
  const { sessions } = await accountApi("/api/auth/sessions");
  el("sessionsList").replaceChildren();
  for (const s of sessions) {
    const actions = row(
      el("sessionsList"),
      s.current ? "Thiết bị này" : s.label,
      `${new Date(s.last_seen_at).toLocaleString("vi-VN")} · ${s.current ? "hiện tại" : "phiên khác"}`,
    );
    button(actions, "Đăng xuất phiên", async () => {
      if (
        !(await confirmAction(
          "Thu hồi phiên?",
          "Thiết bị này sẽ cần đăng nhập lại.",
        ))
      )
        return;
      await accountApi("/api/auth/sessions/" + s.id + "/revoke", {});
      if (s.current) clearSession();
      else await loadSessions();
    });
  }
}
window.addEventListener("seruchat-ready", () =>
  loadProfile().catch((e) => notice(e.message, true)),
);
window.addEventListener("seruchat-clear", () => {
  ownProfile = null;
  phoneChallenge = null;
  el("profileDialog").close();
  el("profileForm").reset();
  el("passwordForm").reset();
  el("unlockForm").reset();
  el("sessionsList").replaceChildren();
  el("myAvatar").removeAttribute("src");
  document.querySelector(".workspace").classList.remove("chat-open");
});
accountWork("openProfile", async () => {
  el("profileStatus").textContent = "";
  el("profileDialog").showModal();
  await loadProfile();
  await loadSessions();
});
el("closeProfile").addEventListener("click", () => el("profileDialog").close());
accountWork("profileForm", async () => {
  const phone = el("profilePhone").value;
  await accountApi(
    "/api/profiles/me",
    {
      handle: el("profileHandle").value,
      displayName: el("profileName").value,
      dateOfBirth: el("profileBirth").value,
      phone,
      bio: el("profileBio").value,
      showPhone: el("profileShowPhone").checked,
      showBirthday: el("profileShowBirth").checked,
    },
    "PATCH",
  );
  phoneChallenge = null;
  await loadProfile();
  el("profileStatus").textContent = "Đã lưu hồ sơ.";
  await refreshLists();
});
accountWork("avatarForm", async () => {
  const file = el("avatarFile").files[0];
  if (!file || file.size > 2 * 1024 * 1024) throw new Error("Ảnh tối đa 2 MB.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Chọn PNG, JPEG hoặc WebP.");
  const r = await fetch("/api/profiles/me/avatar", {
    method: "PUT",
    headers: { "Content-Type": file.type, "X-CSRF-Token": await csrfToken() },
    body: file,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message);
  await loadProfile();
  el("avatarForm").reset();
  el("profileStatus").textContent = "Đã cập nhật ảnh đại diện.";
});
accountWork("deleteAvatar", async () => {
  await accountApi("/api/profiles/me/avatar", {}, "DELETE");
  await loadProfile();
  el("profileStatus").textContent = "Đã xóa ảnh.";
});
accountWork("resendEmail", async () => {
  const data = await accountApi("/api/auth/email/request", {
    email: ownProfile.email,
  });
  el("profileStatus").textContent = data.message;
});
accountWork("sendPhone", async () => {
  const data = await accountApi("/api/auth/phone/request", {});
  phoneChallenge = data.id;
  el("profileStatus").textContent = data.message;
});
accountWork("phoneForm", async () => {
  if (!phoneChallenge) throw new Error("Hãy gửi yêu cầu SMS trước.");
  const d = await accountApi("/api/auth/phone/confirm", {
    id: phoneChallenge,
    token: el("phoneCode").value,
  });
  await loadProfile();
  el("phoneForm").reset();
  el("profileStatus").textContent = d.message;
});
accountWork("passwordForm", async () => {
  const password = el("newPassword").value;
  if (password !== el("newPasswordConfirm").value)
    throw new Error("Hai mật khẩu mới chưa khớp.");
  if (
    !(await confirmAction(
      "Đổi mật khẩu?",
      "Tất cả thiết bị cần đăng nhập lại. PIN khôi phục được giữ nguyên.",
    ))
  )
    return;
  let backup;
  if (!recoveryConfigured) {
    const pair =
      keyPair ||
      (await getOrCreateKeyPair(
        currentUserId.textContent,
        el("oldPassword").value,
      ));
    await validateChatKeyPair(pair);
    backup = {
      publicKey: await exportPublicKey(pair.publicKey),
      ...(await encryptPrivateKey(pair.privateKey, password)),
    };
  }
  const d = await accountApi("/api/auth/password/change", {
    currentPassword: el("oldPassword").value,
    password,
    backup,
  });
  clearSession();
  el("loginMessage").textContent = d.message;
});
accountWork("unlockForm", async () => {
  keyPair = await getOrCreateKeyPair(
    currentUserId.textContent,
    el("backupPassword").value,
  );
  el("unlockForm").reset();
  el("keyStatus").textContent = "Khóa mã hóa đã sẵn sàng.";
  updateSendState();
  await refreshMessages();
  el("profileStatus").textContent =
    "Đã mở lại khóa cũ. Chưa thay mật khẩu mã hóa backup.";
});
function openAccount(mode, link = null) {
  accountMode = mode;
  linkData = link;
  el("accountForm").reset();
  el("accountForm").hidden = false;
  el("accountStatus").textContent = "";
  const reset = mode === "reset",
    confirm = mode === "confirm";
  el("accountEmail").hidden = reset || confirm;
  el("accountEmail").previousElementSibling.hidden = reset || confirm;
  el("accountEmail").required = !reset && !confirm;
  el("resetFields").hidden = !reset;
  el("resetPassword").required = reset;
  el("resetConfirm").required = reset;
  el("accountTitle").textContent = reset
    ? "Đặt mật khẩu mới"
    : confirm
      ? "Xác minh email"
      : mode === "forgot"
        ? "Quên mật khẩu"
        : "Gửi email xác minh";
  el("accountHelp").textContent = reset
    ? "Đặt lại mật khẩu không thay đổi PIN. Bạn vẫn cần PIN hoặc mã khôi phục để mở lịch sử trên thiết bị mới."
    : confirm
      ? "Chọn Tiếp tục để sử dụng liên kết xác minh một lần."
      : "Nhập email tài khoản. Nếu phù hợp, liên kết có hiệu lực 10 phút sẽ được gửi. Kiểm tra cả thư rác.";
  el("accountDialog").showModal();
}
el("forgotPassword").addEventListener("click", () => openAccount("forgot"));
el("verifyEmail").addEventListener("click", () => openAccount("email"));
el("closeAccount").addEventListener("click", () => {
  linkData = null;
  el("accountDialog").close();
});
accountWork(
  "accountForm",
  async () => {
    let d;
    if (accountMode === "reset") {
      if (el("resetPassword").value !== el("resetConfirm").value)
        throw new Error("Hai mật khẩu chưa khớp.");
      d = await accountApi("/api/auth/password/reset", {
        ...linkData,
        password: el("resetPassword").value,
      });
      if (ready) clearSession();
    } else if (accountMode === "confirm") {
      d = await accountApi("/api/auth/email/confirm", linkData);
      if (ready) await loadProfile();
    } else
      d = await accountApi(
        accountMode === "forgot"
          ? "/api/auth/password/request"
          : "/api/auth/email/request",
        { email: el("accountEmail").value },
      );
    el("accountStatus").textContent = d.message;
    el("accountForm").reset();
    if (["reset", "confirm"].includes(accountMode))
      el("accountForm").hidden = true;
  },
  "accountStatus",
);
// Tokens stay in the fragment, not HTTP access logs, query strings or localStorage.
if (location.hash.length > 1) {
  const params = new URLSearchParams(location.hash.slice(1));
  const purpose = params.get("purpose"),
    id = params.get("id"),
    token = params.get("token");
  if (!params.has("chat") || ["email", "reset"].includes(purpose))
    history.replaceState(null, "", location.pathname);
  if (["email", "reset"].includes(purpose) && id && token)
    openAccount(purpose === "reset" ? "reset" : "confirm", { id, token });
}
accountWork(
  "handleSearchForm",
  async () => {
    const { users } = await accountApi(
      "/api/profiles/search?q=" + encodeURIComponent(el("handleQuery").value),
    );
    el("handleResults").replaceChildren();
    for (const u of users) {
      const a = row(el("handleResults"), u.displayName, "@" + u.handle);
      button(a, "Xem hồ sơ", async () => {
        found = await api("/api/users/" + u.id);
        const d = await accountApi("/api/profiles/" + u.id);
        el("foundBio").textContent = d.profile.bio;
        userCache.set(u.id, u.displayName);
        renderFound();
        el("foundUser").hidden = false;
      });
    }
    empty(el("handleResults"), "Không tìm thấy handle phù hợp.");
    el("findUserMessage").textContent = "";
  },
  "findUserMessage",
);
for (const tab of document.querySelectorAll("[data-pane]"))
  tab.addEventListener("click", () => {
    for (const node of document.querySelectorAll("[data-pane]")) {
      const active = node === tab;
      el(node.dataset.pane).hidden = !active;
      node.classList.toggle("active", active);
      node.setAttribute("aria-pressed", String(active));
    }
  });
el("backToList").addEventListener("click", () =>
  document.querySelector(".workspace").classList.remove("chat-open"),
);
el("refreshConnections").addEventListener("click", () =>
  refreshLists().catch(report),
);
function filterConnections() {
  const q = el("conversationSearch").value.toLocaleLowerCase("vi-VN");
  for (const row of document.querySelectorAll(".sidebar .list-row"))
    row.hidden = !row.textContent.toLocaleLowerCase("vi-VN").includes(q);
}
el("conversationSearch").addEventListener("input", filterConnections);
window.addEventListener("seruchat-lists", filterConnections);
function filterMessages() {
  const q = el("messageSearch").value.toLocaleLowerCase("vi-VN");
  for (const node of el("messagesList").querySelectorAll(".chat-message"))
    node.hidden = !node
      .querySelector(".message-text")
      .textContent.toLocaleLowerCase("vi-VN")
      .includes(q);
}
el("messageSearch").addEventListener("input", filterMessages);
window.addEventListener("seruchat-messages", filterMessages);
for (const emoji of [
  "😀",
  "😂",
  "🥰",
  "😎",
  "🥲",
  "🤔",
  "👍",
  "🙏",
  "💛",
  "❤️",
  "🎉",
  "🔥",
  "☕",
  "🌿",
  "👨‍👩‍👧‍👦",
  "🇻🇳",
]) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = emoji;
  b.setAttribute("aria-label", "Chèn " + emoji);
  b.addEventListener("click", () => {
    const input = el("messageInput");
    if (input.disabled) return;
    input.setRangeText(emoji, input.selectionStart, input.selectionEnd, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    el("emojiPicker").hidden = true;
    el("emojiToggle").setAttribute("aria-expanded", "false");
    input.focus();
  });
  el("emojiPicker").append(b);
}
el("emojiToggle").addEventListener("click", () => {
  el("emojiPicker").hidden = !el("emojiPicker").hidden;
  el("emojiToggle").setAttribute(
    "aria-expanded",
    String(!el("emojiPicker").hidden),
  );
});
fetch("/api/config")
  .then((r) => r.json())
  .then((c) => {
    el("verifyEmail").hidden = !c.emailConfigured;
    el("resendEmail").hidden = !c.emailConfigured;
    el("sendPhone").hidden = !c.smsConfigured;
    el("phoneForm").hidden = !c.smsConfigured;
    el("forgotPassword").disabled = !c.emailConfigured;
    el("forgotPassword").title = c.emailConfigured
      ? ""
      : "Khôi phục mật khẩu qua email hiện chưa sẵn sàng.";
    el("registerPhone").required = c.phoneRequired;
    el("registerPhone").placeholder = c.phoneRequired
      ? "0912 345 678"
      : "0912 345 678 (tùy chọn)";
  })
  .catch(() => {});
