"use strict";
(() => {
  try {
    document.documentElement.dataset.theme =
      localStorage.getItem("seruchat-theme") || "light";
  } catch {}
  const $ = (id) => document.getElementById(id);
  let page = 0,
    pending = null;
  async function api(url, body) {
    let token;
    if (body !== undefined) {
      const r = await fetch("/api/auth/csrf");
      if (r.ok) token = (await r.json()).token;
    }
    const r = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { "X-CSRF-Token": token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      d = await r.json();
    if (!r.ok) {
      if (r.status === 401) {
        $("adminDashboard").hidden = true;
        $("adminMfa").hidden = true;
        $("adminLogin").hidden = false;
      }
      throw Error(d.message || "Không kết nối được.");
    }
    return d;
  }
  const text = (tag, value, cls) => {
    const n = document.createElement(tag);
    n.textContent = value;
    if (cls) n.className = cls;
    return n;
  };
  function button(label, fn) {
    const b = text("button", label);
    b.type = "button";
    b.onclick = () => work(b, fn);
    return b;
  }
  async function work(b, fn) {
    b.disabled = true;
    $("adminStatus").textContent = "";
    try {
      await fn();
    } catch (e) {
      $("adminStatus").textContent = e.message;
    } finally {
      b.disabled = false;
    }
  }
  async function state() {
    const s = await api("/api/admin/state");
    $("adminLogin").hidden = true;
    $("adminMfa").hidden = s.verified;
    $("adminDashboard").hidden = !s.verified;
    $("mfaSetup").hidden = s.enrolled;
    $("mfaHelp").textContent = s.enrolled
      ? "Nhập mã OTP để tiếp tục."
      : "Thêm tài khoản trong ứng dụng xác thực bằng mã thiết lập sẽ hiện bên dưới.";
    if (s.verified) await load();
  }
  $("adminLoginForm").onsubmit = (e) => {
    e.preventDefault();
    work(e.submitter, async () => {
      await api("/api/auth/login", {
        email: $("adminEmail").value,
        password: $("adminPassword").value,
      });
      $("adminPassword").value = "";
      await state();
    });
  };
  $("mfaSetup").onsubmit = (e) => {
    e.preventDefault();
    work(e.submitter, async () => {
      const d = await api("/api/admin/mfa/setup", {
        password: $("setupPassword").value,
      });
      $("setupPassword").value = "";
      $("mfaSecret").textContent = d.secret;
      $("mfaHelp").textContent =
        "Trong ứng dụng xác thực, thêm khóa thủ công: Seruchat, khóa bên trên, mã theo thời gian (TOTP), 6 số. Sau đó nhập mã để kích hoạt.";
    });
  };
  $("mfaVerify").onsubmit = (e) => {
    e.preventDefault();
    work(e.submitter, async () => {
      await api("/api/admin/mfa/verify", { code: $("otpCode").value });
      $("otpCode").value = "";
      $("mfaSecret").textContent = "";
      await state();
    });
  };
  async function load() {
    const [stats, users, reports, logs] = await Promise.all([
      api("/api/admin/stats"),
      api(
        "/api/admin/users?page=" +
          page +
          "&q=" +
          encodeURIComponent($("adminQuery").value),
      ),
      api("/api/admin/reports"),
      api("/api/admin/audit"),
    ]);
    $("adminStats").replaceChildren();
    for (const [k, label] of Object.entries({
      users: "Tài khoản",
      verified: "Email xác minh",
      activeDay: "Hoạt động 24 giờ",
      groups: "Nhóm",
      conversations: "Hội thoại",
      messages: "Tin mã hóa",
      fileBytes: "Dung lượng tệp (byte)",
      reports: "Báo cáo chờ",
    })) {
      const card = text("div", "", "stat-card");
      card.append(text("strong", String(stats[k])), text("span", label));
      $("adminStats").append(card);
    }
    $("adminUsers").replaceChildren();
    for (const u of users.users) {
      const tr = document.createElement("tr");
      for (const value of [
        u.username,
        u.email,
        u.app_role,
        u.suspended_at ? "Đã tạm khóa" : "Hoạt động",
      ])
        tr.append(text("td", value));
      const td = document.createElement("td");
      if (u.app_role === "user")
        td.append(
          button(u.suspended_at ? "Mở khóa" : "Tạm khóa", () => {
            pending = { id: u.id, suspended: !u.suspended_at };
            $("confirmUser").textContent = u.email;
            $("adminConfirm").showModal();
          }),
        );
      tr.append(td);
      $("adminUsers").append(tr);
    }
    $("pageLabel").textContent = "Trang " + (page + 1);
    $("previousPage").disabled = page === 0;
    $("nextPage").disabled = users.users.length < 50;
    $("adminReports").replaceChildren();
    for (const r of reports.reports) {
      const n = text(
        "div",
        r.reason + " · " + r.status + " · " + r.target_id,
        "admin-entry",
      );
      if (r.status === "open")
        for (const [status, label] of [
          ["reviewed", "Đã xử lý"],
          ["dismissed", "Bỏ qua"],
        ])
          n.append(
            button(label, async () => {
              await api("/api/admin/reports/" + r.id, { status });
              await load();
            }),
          );
      $("adminReports").append(n);
    }
    $("auditState").textContent =
      logs.verified === true
        ? "Chuỗi nhật ký khớp kiểm tra."
        : logs.verified === false
          ? "CẢNH BÁO: chuỗi nhật ký không khớp."
          : "Cần kiểm tra toàn bộ nhật ký bằng CLI.";
    $("adminAudit").replaceChildren();
    for (const r of logs.entries.slice().reverse())
      $("adminAudit").append(
        text(
          "div",
          r.created_at +
            " · " +
            r.action +
            " · " +
            (r.actor_id || "CLI") +
            " · " +
            (r.target_id || ""),
          "admin-entry",
        ),
      );
  }
  $("adminConfirmForm").onsubmit = (e) => {
    e.preventDefault();
    work(e.submitter, async () => {
      if (!pending) return;
      await api("/api/admin/users/" + pending.id + "/suspend", {
        suspended: pending.suspended,
        password: $("actionPassword").value,
      });
      $("actionPassword").value = "";
      $("adminConfirm").close();
      pending = null;
      await load();
    });
  };
  $("cancelAdminAction").onclick = () => {
    $("adminConfirm").close();
    $("actionPassword").value = "";
    pending = null;
  };
  $("refreshAdmin").onclick = () => work($("refreshAdmin"), state);
  $("userSearch").onsubmit = (e) => {
    e.preventDefault();
    page = 0;
    work(e.submitter, load);
  };
  $("previousPage").onclick = () => {
    page = Math.max(0, page - 1);
    work($("previousPage"), load);
  };
  $("nextPage").onclick = () => {
    page++;
    work($("nextPage"), load);
  };
  $("logoutAdmin").onclick = () =>
    work($("logoutAdmin"), async () => {
      await api("/api/auth/logout", {});
      location.href = "/";
    });
  state().catch((e) => ($("adminStatus").textContent = e.message));
})();
