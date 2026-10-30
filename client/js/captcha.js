"use strict";
(() => {
  let config;
  const ready = fetch("/api/config")
    .then((r) => r.json())
    .then((c) => (config = c.captcha));
  const native = window.fetch.bind(window);
  let loader;
  async function load() {
    if (window.turnstile) return;
    if (!loader)
      loader = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(Error("Không tải được kiểm tra bảo mật."));
        document.head.append(s);
      });
    await loader;
  }
  const routes = {
    "/api/auth/login": "login",
    "/api/auth/register": "register",
    "/api/auth/password/request": "reset",
    "/api/auth/email/request": "email",
  };
  window.fetch = async (url, options) => {
    const action = routes[String(url)];
    if (!action || !options?.body) return native(url, options);
    await ready;
    if (!config?.enabled) return native(url, options);
    await load();
    const dialog = document.createElement("dialog"),
      host = document.createElement("div"),
      title = document.createElement("p");
    title.textContent = "Kiểm tra bảo mật";
    dialog.append(title, host);
    document.body.append(dialog);
    dialog.showModal();
    let id;
    try {
      const token = await new Promise((resolve, reject) => {
        let done = false;
        const finish = (error, value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          error ? reject(error) : resolve(value);
        };
        const timer = setTimeout(
          () => finish(Error("Kiểm tra đã hết thời gian. Vui lòng thử lại.")),
          120000,
        );
        dialog.addEventListener("cancel", () =>
          finish(Error("Đã hủy kiểm tra.")),
        );
        id = turnstile.render(host, {
          sitekey: config.siteKey,
          action,
          callback: (token) => finish(null, token),
          "error-callback": () => finish(Error("Kiểm tra bảo mật thất bại.")),
          "expired-callback": () => finish(Error("Mã kiểm tra đã hết hạn.")),
        });
      });
      const body = JSON.parse(options.body);
      return await native(url, {
        ...options,
        body: JSON.stringify({ ...body, captchaToken: token }),
      });
    } finally {
      if (id !== undefined) turnstile.remove(id);
      dialog.close();
      dialog.remove();
    }
  };
})();
