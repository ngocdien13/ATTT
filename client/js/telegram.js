"use strict";
(() => {
  const aside = document.querySelector(".sidebar"),
    workspace = document.querySelector(".workspace");
  document.body.classList.add("telegram");
  const accountChannel =
    typeof BroadcastChannel === "function"
      ? new BroadcastChannel("seruchat-account")
      : null;
  if (accountChannel)
    accountChannel.onmessage = ({ data }) => {
      if (
        ready &&
        data?.type === "switch" &&
        typeof data.userId === "string" &&
        data.userId !== currentUserId.textContent
      ) {
        clearSession();
        el("loginMessage").textContent =
          "Tài khoản đã được chuyển ở tab khác. Đăng nhập lại để tiếp tục.";
      }
    };
  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const icon = (name) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.classList.add("tg-icon");
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", "/ui-icons.svg#" + name);
    svg.append(use);
    return svg;
  };
  const makeButton = (label, fn, cls = "") => {
    const b = node("button", cls, label);
    b.type = "button";
    b.onclick = async () => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        await fn(b);
      } catch (e) {
        notice(e.message, true);
      } finally {
        b.disabled = false;
      }
    };
    return b;
  };
  const ui = document.createElement("div");
  ui.className = "tg-top";
  const hamburger = makeButton("☰", () => toggleMenu(), "icon-button");
  hamburger.id = "mainMenuButton";
  hamburger.setAttribute("aria-label", "Mở menu");
  hamburger.setAttribute("aria-expanded", "false");
  hamburger.replaceChildren(icon("menu"));
  const search = el("conversationSearch");
  search.placeholder = "Tìm cuộc trò chuyện";
  const searchBox = node("div", "tg-search-box");
  searchBox.append(icon("search"), search);
  const filterBack = makeButton("", () => setFilter("all"), "icon-button");
  filterBack.id = "filterBack";
  filterBack.setAttribute("aria-label", "Quay lại tất cả");
  filterBack.append(icon("back"));
  filterBack.hidden = true;
  ui.append(hamburger, filterBack, searchBox);
  aside.prepend(ui);
  const panel = node("section", "tg-thread-panel");
  panel.id = "unifiedPane";
  const filters = node("nav", "tg-filters");
  filters.setAttribute("aria-label", "Lọc cuộc trò chuyện");
  filters.id = "threadFilters";
  filters.hidden = true;
  let filter = "all",
    rooms = [],
    selected = null,
    loading = false,
    generation = 0,
    source = "",
    roomSource = "",
    previewCache = new Map(),
    first = true,
    notesKey = null,
    navigationRequest = 0,
    loadedSelection = null;
  for (const [value, label] of [
    ["all", "Tất cả"],
    ["unread", "Chưa đọc"],
    ["groups", "Nhóm"],
    ["archive", "Lưu trữ"],
  ]) {
    const b = makeButton(label, () => {
      setFilter(value);
    });
    b.dataset.filter = value;
    filters.append(b);
  }
  const list = node("div", "tg-threads");
  list.id = "threadList";
  list.setAttribute("aria-label", "Cuộc trò chuyện");
  const profilePrompt = node("section", "tg-profile-prompt");
  profilePrompt.hidden = true;
  const hint = makeButton(
      "",
      () => openProfilePanel("profile"),
      "tg-profile-prompt-action",
    ),
    hintTitle = node("strong"),
    hintText = node("span");
  hint.append(hintTitle, hintText);
  const dismissHint = makeButton(
    "",
    () => {
      profilePrompt.hidden = true;
      try {
        localStorage.setItem(
          "seruchat-profile-hint:" + currentUserId.textContent,
          "hidden",
        );
      } catch {}
    },
    "tg-dismiss",
  );
  dismissHint.append(icon("close"));
  dismissHint.setAttribute("aria-label", "Đóng gợi ý");
  profilePrompt.append(hint, dismissHint);
  const archiveFolder = makeButton(
    "",
    () => setFilter("archive"),
    "tg-archive-folder",
  );
  archiveFolder.id = "archiveFolder";
  archiveFolder.hidden = true;
  const aa = node("span", "tg-avatar tg-archive-avatar"),
    ai = node("span", "tg-room-info"),
    archiveNames = node("span", "tg-preview"),
    archiveCount = node("span", "tg-badge");
  aa.append(icon("archive"));
  ai.append(node("strong", "", "Cuộc trò chuyện đã lưu trữ"), archiveNames);
  archiveFolder.append(aa, ai, archiveCount);
  const savedThread = makeButton("", openNotes, "tg-room tg-saved-thread");
  savedThread.id = "savedThread";
  const sa = node("span", "tg-avatar tg-saved-avatar"),
    si = node("span", "tg-room-info");
  sa.append(icon("bookmark"));
  si.append(
    node("strong", "", "Tin nhắn đã lưu"),
    node("span", "tg-preview", "Ghi chú và tin nhắn dành riêng cho bạn"),
  );
  savedThread.append(sa, si);
  panel.append(profilePrompt, filters, archiveFolder, list);
  ui.after(panel);
  const paneTop = node("div", "tg-pane-title");
  paneTop.hidden = true;
  const back = makeButton("←", () => showPane("unifiedPane"), "icon-button");
  const paneTitle = node("h2");
  paneTop.append(back, paneTitle);
  panel.before(paneTop);
  const floating = makeButton("✎", () => toggleNew(), "tg-compose");
  floating.replaceChildren(icon("compose"));
  floating.id = "newChatButton";
  floating.setAttribute("aria-label", "Cuộc trò chuyện mới");
  aside.append(floating);
  const menu = node("div", "tg-menu");
  menu.id = "mainMenu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  aside.append(menu);
  const pop = node("div", "tg-menu tg-context");
  pop.id = "contextMenu";
  pop.hidden = true;
  document.body.append(pop);
  const moreMenu = node("div", "tg-menu tg-submenu");
  for (const popup of [menu, pop, moreMenu])
    popup.addEventListener("click", (e) => e.stopPropagation());
  moreMenu.id = "moreMenu";
  moreMenu.hidden = true;
  document.body.append(moreMenu);
  function closeMenus() {
    moreMenu.hidden = true;
    menu
      .querySelector('[aria-haspopup="menu"]')
      ?.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    pop.hidden = true;
    hamburger.setAttribute("aria-expanded", "false");
  }
  function toggleMenu() {
    const open = menu.hidden;
    closeMenus();
    menu.hidden = !open;
    hamburger.setAttribute("aria-expanded", String(open));
  }
  function item(parent, label, fn, danger = false, symbol = "") {
    const b = makeButton(
      label,
      async () => {
        closeMenus();
        await fn();
      },
      danger ? "menu-danger" : "",
    );
    b.setAttribute("role", "menuitem");
    if (symbol)
      b.replaceChildren(icon(symbol), node("span", "tg-menu-label", label));
    parent.append(b);
    return b;
  }
  const menuAccount = item(menu, "Tài khoản của bạn", () =>
    openProfilePanel("profile"),
  );
  menuAccount.id = "menuAccount";
  const accountAvatar = node("span", "tg-account-avatar"),
    accountName = node("span", "tg-menu-label", "Seruchat");
  menuAccount.replaceChildren(accountAvatar, accountName);
  const addAccount = item(
    menu,
    "Thêm tài khoản",
    () => addAccountDialog.showModal(),
    false,
    "plus",
  );
  addAccount.classList.add("tg-menu-divider");
  item(menu, "Hồ sơ của tôi", () => openProfilePanel("profile"), false, "user");
  item(menu, "Tin nhắn đã lưu", openNotes, false, "bookmark");
  item(menu, "Danh bạ", () => showPane("peoplePane"), false, "contacts");
  item(menu, "Cài đặt", () => openProfilePanel("settings"), false, "settings");
  const moreButton = item(menu, "Khác", () => {}, false, "more");
  moreButton.append(icon("chevron"));
  moreButton.setAttribute("aria-haspopup", "menu");
  moreButton.setAttribute("aria-expanded", "false");
  function showMore() {
    if (menu.hidden) return;
    moreMenu.hidden = false;
    moreButton.setAttribute("aria-expanded", "true");
    const r = moreButton.getBoundingClientRect();
    moreMenu.style.left =
      Math.max(
        8,
        Math.min(innerWidth - moreMenu.offsetWidth - 8, r.right + 6),
      ) + "px";
    moreMenu.style.top =
      Math.max(8, Math.min(innerHeight - moreMenu.offsetHeight - 8, r.top)) +
      "px";
  }
  moreButton.onclick = showMore;
  moreButton.onmouseenter = showMore;
  moreButton.onkeydown = (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      showMore();
      moreMenu.querySelector("button")?.focus();
    }
  };
  item(
    moreMenu,
    "Tất cả cuộc trò chuyện",
    () => setFilter("all"),
    false,
    "chat",
  );
  item(moreMenu, "Chưa đọc", () => setFilter("unread"), false, "unread");
  item(
    moreMenu,
    "Nhóm & lời mời",
    () => showPane("groupPane"),
    false,
    "contacts",
  );
  item(moreMenu, "Chỉ hiện nhóm", () => setFilter("groups"), false, "group");
  item(moreMenu, "Tìm bạn", () => showPane("findUserSection"), false, "search");
  item(
    moreMenu,
    "Giao diện sáng / tối",
    () => el("themeToggle").click(),
    false,
    "moon",
  );
  const adminItem = item(
    moreMenu,
    "Quản trị",
    () => {
      location.href = "/admin";
    },
    false,
    "shield",
  );
  adminItem.hidden = true;
  item(moreMenu, "Đăng xuất", () => el("logout").click(), false, "logout");
  function openProfilePanel(mode) {
    el("profileDialog").dataset.mode = mode;
    el("profileTitle").textContent =
      mode === "profile" ? "Hồ sơ của tôi" : "Cài đặt";
    el("openProfile").click();
  }
  function setFilter(value) {
    filter = value;
    search.value = "";
    draw();
  }
  function updateAccount() {
    const name = el("username").textContent || "Seruchat";
    if (accountName.textContent !== name) accountName.textContent = name;
    menuAccount.setAttribute("aria-label", name);
    const src = !el("myAvatar").hidden
      ? el("myAvatar").getAttribute("src")
      : null;
    const current = accountAvatar.dataset.src || "";
    if (
      current !== (src || "") ||
      (!src && accountAvatar.textContent !== Array.from(name)[0])
    ) {
      accountAvatar.replaceChildren();
      if (src) {
        const img = node("img");
        img.src = src;
        img.alt = "";
        accountAvatar.append(img);
      } else accountAvatar.textContent = Array.from(name)[0] || "S";
      accountAvatar.dataset.src = src || "";
    }
    if (!ready || !ownProfile) {
      profilePrompt.hidden = true;
      return;
    }
    let dismissed = false;
    try {
      dismissed =
        localStorage.getItem(
          "seruchat-profile-hint:" + currentUserId.textContent,
        ) === "hidden";
    } catch {}
    profilePrompt.hidden =
      dismissed ||
      !!(ownProfile.dateOfBirth && ownProfile.avatarUrl) ||
      filter !== "all";
    hintTitle.textContent = ownProfile.dateOfBirth
      ? "Thêm ảnh đại diện"
      : "Thêm ngày sinh! 🎂";
    hintText.textContent = ownProfile.dateOfBirth
      ? "Để bạn bè dễ dàng nhận ra bạn."
      : "Để những người bạn biết ngày đặc biệt của bạn.";
  }
  new MutationObserver(updateAccount).observe(el("username"), {
    childList: true,
  });
  new MutationObserver(updateAccount).observe(el("myAvatar"), {
    attributes: true,
    attributeFilter: ["src", "hidden"],
  });
  function toggleNew() {
    closeMenus();
    menu.hidden = false;
    menu.replaceChildren();
    item(menu, "Nhắn tin mới", () => showPane("peoplePane"), false, "chat");
    item(
      menu,
      "Tìm người dùng",
      () => showPane("findUserSection"),
      false,
      "search",
    );
    item(menu, "Tạo nhóm", () => el("newGroup").click(), false, "group");
    item(menu, "← Menu chính", () => {
      menu.replaceChildren(...mainItems);
      menu.hidden = false;
    });
  }
  // Restore the main menu without requiring a page reload after the compose menu.
  const mainItems = [...menu.children];
  hamburger.onclick = () => {
    menu.replaceChildren(...mainItems);
    toggleMenu();
  };
  function showPane(id) {
    for (const n of [
      "unifiedPane",
      "conversationsSection",
      "groupPane",
      "peoplePane",
      "findUserSection",
    ])
      el(n).hidden = n !== id;
    paneTop.hidden = id === "unifiedPane";
    paneTitle.textContent =
      {
        peoplePane: "Bạn bè & lời mời",
        groupPane: "Nhóm & lời mời",
        findUserSection: "Tìm bạn",
      }[id] || "";
    document.querySelector(".workspace").classList.remove("chat-open");
    floating.hidden = id !== "unifiedPane";
  }
  for (const b of document.querySelectorAll("[data-pane]"))
    b.addEventListener("click", () => showPane(b.dataset.pane));
  document.querySelector(".tabs").hidden = true;
  document.querySelector(".sidebar-title").hidden = true;
  document.querySelector(".app-rail").hidden = true;
  el("conversationsSection").hidden = true;
  el("groupPane").hidden = true;
  el("peoplePane").hidden = true;
  el("findUserSection").hidden = true;
  const draftInput = () =>
    selected?.scope === "group" ? el("groupMessageInput") : el("messageInput");
  function stash() {
    if (selected && loadedSelection === selected.scope + ":" + selected.id)
      ThreadActions.drafts.set(
        selected.scope + ":" + selected.id,
        draftInput().value,
      );
    ThreadActions.cancel();
  }
  async function openRoom(room) {
    stash();
    loadedSelection = null;
    const request = ++navigationRequest;
    selected = room;
    const gen = generation;
    if (room.scope === "group") await SeruchatChat.openGroup(room.id);
    else
      await openConversation(
        room.id,
        room.peer_id,
        room.friendship_status,
        room.blocked_by,
      );
    if (
      gen !== generation ||
      request !== navigationRequest ||
      selected?.id !== room.id ||
      selected?.scope !== room.scope
    )
      return;
    draftInput().value =
      ThreadActions.drafts.get(room.scope + ":" + room.id) || "";
    showPane("unifiedPane");
    workspace.classList.add("chat-open");
    draw();
    await markRead(true);
  }
  function avatar(room) {
    const a = node(
      "span",
      "tg-avatar",
      Array.from(room.name || "?")
        .slice(0, 2)
        .join("")
        .toUpperCase(),
    );
    a.dataset.color = String((room.name || "?").codePointAt(0) % 5);
    if (room.scope === "direct" && room.avatar_key) {
      const img = node("img");
      img.alt = "";
      img.src = "/api/profiles/" + room.peer_id + "/avatar";
      a.replaceChildren(img);
    }
    return a;
  }
  function draw() {
    const archived = rooms.filter((r) => r.archived);
    archiveFolder.hidden =
      filter !== "all" || !archived.length || !!search.value;
    archiveNames.textContent = archived
      .map((r) => r.name)
      .slice(0, 4)
      .join(", ");
    archiveCount.textContent = String(
      archived.reduce(
        (n, r) => n + r.unread + Number(r.markedUnread && !r.unread),
        0,
      ),
    );
    archiveCount.hidden = archiveCount.textContent === "0";
    hamburger.hidden = filter !== "all";
    filterBack.hidden = filter === "all";
    search.placeholder = {
      all: "Tìm kiếm",
      archive: "Cuộc trò chuyện đã lưu trữ",
      unread: "Chưa đọc",
      groups: "Nhóm",
    }[filter];
    updateAccount();
    const q = search.value.toLocaleLowerCase("vi-VN"),
      visible = rooms.filter(
        (r) =>
          (filter === "archive" ? r.archived : !r.archived) &&
          (filter !== "groups" || r.scope === "group") &&
          (filter !== "unread" || r.unread || r.markedUnread) &&
          r.name.toLocaleLowerCase("vi-VN").includes(q),
      );
    const signature =
      JSON.stringify(
        visible.map((r) => [
          r.scope,
          r.id,
          r.name,
          r.preview,
          r.unread,
          r.markedUnread,
          r.pinned,
          r.mutedUntil,
          r.last?.id,
          r.avatar_key,
        ]),
      ) +
      "|" +
      filter +
      "|" +
      selected?.scope +
      selected?.id;
    for (const b of filters.children) {
      b.classList.toggle("active", b.dataset.filter === filter);
      b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
    }
    if (signature === roomSource) return;
    roomSource = signature;
    const existing = new Map(
      [...list.querySelectorAll("[data-room]")].map((n) => [n.dataset.room, n]),
    );
    const ordered = [];
    for (const room of visible) {
      const k = room.scope + ":" + room.id,
        old = existing.get(k),
        fingerprint = JSON.stringify([
          room,
          selected?.scope === room.scope && selected?.id === room.id,
        ]);
      let row = old;
      if (!old || old.dataset.fingerprint !== fingerprint) {
        row = node("div", "tg-room");
        row.dataset.room = k;
        row.dataset.fingerprint = fingerprint;
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", room.name);
        row.classList.toggle(
          "selected",
          selected?.id === room.id && selected?.scope === room.scope,
        );
        const info = node("div", "tg-room-info"),
          top = node("div", "tg-room-top"),
          bottom = node("div", "tg-room-bottom");
        top.append(node("strong", "", room.name));
        if (room.mutedUntil && new Date(room.mutedUntil) > new Date()) {
          const m = icon("muted");
          m.classList.add("tg-mute");
          top.append(m);
        }
        const time = room.last
          ? new Date(room.last.created_at).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        top.append(node("time", "", time));
        bottom.append(
          node(
            "span",
            "tg-preview",
            room.preview ||
              (room.scope === "group"
                ? "Nhóm trò chuyện"
                : "Bắt đầu câu chuyện"),
          ),
        );
        if (room.pinned) {
          const pin = icon("pin");
          pin.classList.add("tg-pin");
          bottom.append(pin);
        }
        if (room.unread || room.markedUnread)
          bottom.append(node("span", "tg-badge", String(room.unread || "•")));
        info.append(top, bottom);
        const more = makeButton("⋮", () => roomMenu(room, more), "tg-row-menu");
        more.replaceChildren(icon("dots"));
        more.setAttribute("aria-label", "Thao tác " + room.name);
        more.onclick = (e) => {
          e.stopPropagation();
          roomMenu(room, more);
        };
        row.append(avatar(room), info, more);
        row.onclick = () =>
          openRoom(room).catch((e) => notice(e.message, true));
        row.onkeydown = (e) => {
          if (e.target === row && e.key === "Enter") row.click();
        };
        row.oncontextmenu = (e) => {
          e.preventDefault();
          roomMenu(room, row, e);
        };
        let timer;
        row.onpointerdown = (e) => {
          if (e.pointerType === "touch")
            timer = setTimeout(() => roomMenu(room, row), 550);
        };
        for (const event of ["pointerup", "pointercancel", "pointermove"])
          row.addEventListener(event, () => clearTimeout(timer));
      }
      ordered.push(row);
    }
    if (filter === "all" && (!q || "tin nhắn đã lưu".includes(q)))
      ordered.push(savedThread);
    if (ordered.length) {
      list.querySelector(".empty-state")?.remove();
      let cursor = list.firstElementChild;
      for (const row of ordered) {
        if (cursor === row) cursor = cursor.nextElementSibling;
        else list.insertBefore(row, cursor);
      }
      for (const child of [...list.children])
        if (!ordered.includes(child)) child.remove();
    } else {
      list.replaceChildren(
        node(
          "p",
          "empty-state",
          q
            ? "Không tìm thấy cuộc trò chuyện."
            : "Chưa có cuộc trò chuyện trong mục này.",
        ),
      );
    }
  }
  function position(anchor, point) {
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    pop.style.left =
      Math.max(
        8,
        Math.min(
          innerWidth - pop.offsetWidth - 8,
          point?.clientX ?? r.right - pop.offsetWidth,
        ),
      ) + "px";
    pop.style.top =
      Math.max(
        8,
        Math.min(
          innerHeight - pop.offsetHeight - 8,
          point?.clientY ?? r.bottom,
        ),
      ) + "px";
    pop.querySelector("button")?.focus();
  }
  async function pref(room, data) {
    await accountApi(
      "/api/workspace/" + room.scope + "/" + room.id,
      data,
      "PATCH",
    );
    await refresh(true);
  }
  async function reportRoom(room) {
    if (room?.scope !== "direct") return;
    if (
      await confirmAction(
        "Báo cáo spam?",
        "Chỉ gửi thông tin tài khoản bị báo cáo, không gửi nội dung chat.",
      )
    ) {
      await accountApi("/api/workspace/reports", {
        targetId: room.peer_id,
        reason: "spam",
      });
      notice("Đã gửi báo cáo.");
    }
  }
  function roomMenu(room, anchor, point) {
    closeMenus();
    pop.replaceChildren();
    item(
      pop,
      "Mở trong tab mới",
      () =>
        window.open(
          "/#" + new URLSearchParams({ chat: room.scope + ":" + room.id }),
          "_blank",
          "noopener,noreferrer",
        ),
      false,
      "new-tab",
    );
    item(pop, "Xem nhanh", () => quickPreview(room), false, "eye");
    item(
      pop,
      "Đánh dấu chưa đọc",
      () => pref(room, { markedUnread: true }),
      false,
      "unread",
    );
    item(
      pop,
      room.pinned ? "Bỏ ghim cuộc trò chuyện" : "Ghim lên đầu",
      () => pref(room, { pinned: !room.pinned }),
      false,
      "pin",
    );
    const muted = room.mutedUntil && new Date(room.mutedUntil) > new Date();
    if (muted)
      item(
        pop,
        "Bật thông báo",
        () => pref(room, { mutedSeconds: 0 }),
        false,
        "bell",
      );
    else
      item(
        pop,
        "Tắt thông báo",
        () => {
          pop.replaceChildren();
          item(
            pop,
            "← Quay lại",
            () => roomMenu(room, anchor, point),
            false,
            "back",
          );
          for (const [seconds, label] of [
            [3600, "1 giờ"],
            [28800, "8 giờ"],
            [172800, "2 ngày"],
            [315360000, "đến khi bật lại"],
          ])
            item(
              pop,
              "Tắt thông báo " + label,
              () => pref(room, { mutedSeconds: seconds }),
              false,
              "muted",
            );
          position(anchor, point);
        },
        false,
        "muted",
      );
    item(
      pop,
      room.archived ? "Đưa ra khỏi lưu trữ" : "Lưu trữ",
      () => pref(room, { archived: !room.archived }),
      false,
      "archive",
    );
    item(
      pop,
      "Xóa cuộc trò chuyện",
      async () => {
        if (
          await confirmAction(
            "Xóa khỏi danh sách của bạn?",
            "Thao tác này ẩn cuộc trò chuyện và giữ lịch sử. Khi có tin mới hoặc mở lại từ danh bạ, cuộc trò chuyện sẽ xuất hiện lại.",
          )
        )
          await pref(room, { hide: true });
      },
      true,
      "trash",
    );
    position(anchor, point);
  }
  const previewDialog = node("dialog", "tg-preview-dialog"),
    previewHead = node("div", "dialog-top"),
    previewTitle = node("h2"),
    previewContent = node("div", "tg-preview-content"),
    previewActions = node("div", "tg-dialog-actions");
  previewHead.append(
    previewTitle,
    makeButton("✕", () => previewDialog.close(), "quiet"),
  );
  previewDialog.append(previewHead, previewContent, previewActions);
  document.body.append(previewDialog);
  function quickPreview(room) {
    previewTitle.textContent = room.name;
    previewContent.replaceChildren(
      avatar(room),
      node("p", "muted", "Tin nhắn mới nhất"),
      node("p", "message-text", room.preview || "Chưa có tin nhắn."),
    );
    previewActions.replaceChildren(
      makeButton("Đóng", () => previewDialog.close(), "quiet"),
      makeButton(
        "Mở cuộc trò chuyện",
        async () => {
          previewDialog.close();
          await openRoom(room);
        },
        "primary",
      ),
    );
    previewDialog.showModal();
  }
  const addAccountDialog = node("dialog", "tg-add-account"),
    addHead = node("div", "dialog-top"),
    addForm = node("form"),
    addEmail = node("input"),
    addPassword = node("input"),
    addStatus = node("p");
  addHead.append(
    node("h2", "", "Thêm tài khoản"),
    makeButton("✕", () => addAccountDialog.close(), "quiet"),
  );
  addEmail.id = "switchEmail";
  addEmail.type = "email";
  addEmail.autocomplete = "username";
  addEmail.required = true;
  addPassword.id = "switchPassword";
  addPassword.type = "password";
  addPassword.autocomplete = "current-password";
  addPassword.required = true;
  const emailLabel = node("label", "", "Email"),
    passLabel = node("label", "", "Mật khẩu");
  emailLabel.htmlFor = addEmail.id;
  passLabel.htmlFor = addPassword.id;
  const addSubmit = node("button", "primary", "Tiếp tục");
  addSubmit.type = "submit";
  addForm.append(
    emailLabel,
    addEmail,
    passLabel,
    addPassword,
    addStatus,
    addSubmit,
  );
  addAccountDialog.append(
    addHead,
    node("p", "muted", "Đăng nhập tài khoản khác trên trình duyệt này."),
    addForm,
  );
  document.body.append(addAccountDialog);
  addAccountDialog.addEventListener("cancel", (e) => {
    if (addSubmit.disabled) e.preventDefault();
  });
  addForm.onsubmit = async (e) => {
    e.preventDefault();
    if (addSubmit.disabled) return;
    addSubmit.disabled = true;
    const closeButton = addAccountDialog.querySelector(".dialog-top button");
    closeButton.disabled = true;
    addStatus.textContent = "";
    try {
      const password = addPassword.value,
        response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: addEmail.value, password }),
        }),
        data = await response.json();
      if (!response.ok) throw Error(data.message || "Không đăng nhập được.");
      accountChannel?.postMessage({ type: "switch", userId: data.user.id });
      addPassword.value = "";
      addAccountDialog.close();
      clearSession();
      await showUser(data.user, password);
    } catch (error) {
      if (addAccountDialog.open) addStatus.textContent = error.message;
      else notice(error.message, true);
    } finally {
      addSubmit.disabled = false;
      closeButton.disabled = false;
    }
  };
  addAccountDialog.addEventListener("close", () => {
    addForm.reset();
    addStatus.textContent = "";
  });
  let pendingLink = new URLSearchParams(location.hash.slice(1)).get("chat");
  async function refresh(force = false) {
    if (!ready || loading || (document.hidden && !force)) return;
    loading = true;
    const gen = generation;
    try {
      const data = await accountApi("/api/workspace");
      if (gen !== generation) return;
      const signature = JSON.stringify(data.threads);
      if (signature !== source || force) {
        source = signature;
        for (const room of data.threads) {
          const token =
            room.scope + ":" + room.id + ":" + JSON.stringify(room.last);
          let cached = previewCache.get(token);
          if (cached === undefined) {
            try {
              cached = await SeruchatChat.preview(room);
            } catch {
              cached = "Không thể mở bản xem trước";
            }
            if (gen !== generation) return;
            previewCache.set(token, cached);
            while (previewCache.size > 512)
              previewCache.delete(previewCache.keys().next().value);
          }
          room.preview = cached;
        }
        if (!first)
          for (const room of data.threads) {
            const old = rooms.find(
              (r) => r.id === room.id && r.scope === room.scope,
            );
            if (
              old &&
              room.last &&
              old.last?.id !== room.last.id &&
              room.last.sender_id !== currentUserId.textContent &&
              !(
                selected?.id === room.id &&
                workspace.classList.contains("chat-open")
              ) &&
              !(room.mutedUntil && new Date(room.mutedUntil) > new Date())
            )
              notify(room);
          }
        rooms = data.threads;
        first = false;
        draw();
        if (pendingLink) {
          const target = rooms.find(
            (r) => r.scope + ":" + r.id === pendingLink,
          );
          if (target) {
            pendingLink = null;
            await openRoom(target);
          }
        }
      }
      await markRead();
    } catch (e) {
      if (ready) notice(e.message, true);
    } finally {
      loading = false;
    }
  }
  async function markRead(force = false) {
    if (
      !selected ||
      document.hidden ||
      !workspace.classList.contains("chat-open")
    )
      return;
    const list = el(
        selected.scope === "group" ? "groupMessages" : "messagesList",
      ),
      nodes = [...list.querySelectorAll(".chat-message")],
      last = nodes.at(-1);
    if (
      !last ||
      last.querySelector(".error") ||
      (!force && last.dataset.readSent === "true")
    )
      return;
    const room = rooms.find(
      (r) => r.id === selected.id && r.scope === selected.scope,
    );
    if (!room?.last || room.last.id !== last.dataset.messageId) return;
    await accountApi(
      "/api/workspace/" + selected.scope + "/" + selected.id + "/read",
      {
        messageId: last.dataset.messageId,
        kind: last.dataset.legacy ? "legacy" : "v2",
      },
    );
    last.dataset.readSent = "true";
    room.unread = 0;
    room.markedUnread = false;
    draw();
  }
  function notify(room) {
    if (
      localStorage.getItem("seruchat-notifications") === "true" &&
      "Notification" in window &&
      Notification.permission === "granted"
    )
      new Notification(room.name, {
        body:
          localStorage.getItem("seruchat-notification-preview") === "true"
            ? room.preview
            : "Bạn có tin nhắn mới.",
        tag: room.scope + room.id,
      });
  }
  const noticeButton = makeButton(
    "Bật thông báo trên trình duyệt",
    async () => {
      if (!("Notification" in window))
        throw Error("Trình duyệt chưa hỗ trợ thông báo.");
      const p = await Notification.requestPermission();
      localStorage.setItem("seruchat-notifications", String(p === "granted"));
      notice(
        p === "granted"
          ? "Đã bật thông báo."
          : "Chưa được cấp quyền thông báo.",
      );
    },
  );
  noticeButton.replaceChildren(
    icon("bell"),
    node("span", "tg-menu-label", "Bật thông báo trình duyệt"),
  );
  noticeButton.setAttribute("role", "menuitem");
  moreMenu.append(noticeButton);
  item(
    moreMenu,
    "Báo cáo cuộc trò chuyện",
    () => reportRoom(selected),
    false,
    "flag",
  );
  const previewLabel = node("label", "check"),
    previewBox = node("input");
  previewBox.type = "checkbox";
  previewBox.checked =
    localStorage.getItem("seruchat-notification-preview") === "true";
  previewBox.onchange = () =>
    localStorage.setItem(
      "seruchat-notification-preview",
      String(previewBox.checked),
    );
  previewLabel.append(
    previewBox,
    document.createTextNode("Hiện nội dung trong thông báo"),
  );
  el("profileDialog").append(
    previewLabel,
    makeButton("Cấp quyền thông báo", () => noticeButton.click()),
  );
  const composer = node("div", "tg-composer-state");
  composer.hidden = true;
  const composerText = node("span");
  composer.append(
    composerText,
    makeButton("✕", () => ThreadActions.cancel(), "icon-button"),
  );
  window.addEventListener("seruchat-composer", (e) => {
    const data = e.detail;
    composer.hidden = !data;
    if (!data) return;
    const input =
      data.scope === "group" ? el("groupMessageInput") : el("messageInput");
    input.closest("form").before(composer);
    composerText.textContent =
      (data.op === "edit" ? "Sửa tin: " : "Trả lời: ") +
      data.text.slice(0, 100);
    if (data.op === "edit") input.value = data.text;
    input.focus();
  });
  document.addEventListener("contextmenu", (e) => {
    const message = e.target.closest(".chat-message");
    if (message && message.dataset.messageId) {
      e.preventDefault();
      messageMenu(message);
    }
  });
  document.addEventListener("keydown", (e) => {
    const current = e.target.closest(".tg-menu");
    if (current && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      const buttons = [
        ...current.querySelectorAll("button:not([hidden]):not(:disabled)"),
      ];
      const n = buttons.indexOf(e.target.closest("button"));
      e.preventDefault();
      buttons[
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? buttons.length - 1
            : (n + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
      ]?.focus();
    }
    if (e.key === "ArrowLeft" && current === moreMenu) {
      moreMenu.hidden = true;
      moreButton.focus();
    }
    if (e.key === "Escape") {
      closeMenus();
      ThreadActions.cancel();
    }
    if (e.key === "ContextMenu" && e.target.closest(".chat-message")) {
      e.preventDefault();
      messageMenu(e.target.closest(".chat-message"));
    }
  });
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".tg-menu") &&
      !e.target.closest(".tg-row-menu") &&
      !e.target.closest("#mainMenuButton") &&
      !e.target.closest("#newChatButton") &&
      !e.target.closest(".chat-message")
    )
      closeMenus();
  });
  for (const id of ["groupMessages", "messagesList"]) {
    el(id).addEventListener("click", (e) => {
      const n = e.target.closest(".chat-message");
      if (n && !e.target.closest("button,a")) messageMenu(n);
    });
  }
  function messageMenu(message) {
    const text = message.querySelector(".message-text")?.textContent || "",
      target = {
        scope: message.dataset.scope || "direct",
        id: message.dataset.thread || currentConversationId,
        messageId: message.dataset.messageId,
      };
    if (!target.id) return;
    closeMenus();
    pop.replaceChildren();
    item(
      pop,
      "Sao chép",
      () => navigator.clipboard.writeText(text),
      false,
      "copy",
    );
    item(pop, "Lưu tin nhắn", () => saveNote(text), false, "bookmark");
    if (
      message.dataset.verified === "true" &&
      message.dataset.recalled !== "true"
    ) {
      item(
        pop,
        "Trả lời",
        () => ThreadActions.select("reply", target, text),
        false,
        "reply",
      );
      if (message.dataset.sender === currentUserId.textContent) {
        if (message.dataset.kind === "text")
          item(pop, "Sửa tin nhắn", () =>
            ThreadActions.select("edit", target, text),
          );
        item(
          pop,
          "Thu hồi tin nhắn",
          async () => {
            if (
              await confirmAction(
                "Thu hồi tin nhắn?",
                "Gửi yêu cầu thu hồi tới cuộc trò chuyện. Người nhận có thể đã lưu nội dung trước đó.",
              )
            )
              await ThreadActions.event("delete", target);
          },
          true,
        );
      }
      for (const emoji of ["👍", "❤️", "😂", "😮", "😢", "🙏"])
        item(pop, emoji, () => ThreadActions.event("react", target, { emoji }));
      item(pop, "Gỡ cảm xúc của tôi", () =>
        ThreadActions.event("react", target, { emoji: "" }),
      );
      if (
        message.dataset.scope === "direct" ||
        ["owner", "admin"].includes(
          rooms.find((r) => r.scope === target.scope && r.id === target.id)
            ?.role,
        )
      ) {
        item(
          pop,
          message.dataset.pinned === "true"
            ? "Bỏ ghim tin nhắn"
            : "Ghim tin nhắn",
          () =>
            ThreadActions.event(
              message.dataset.pinned === "true" ? "unpin" : "pin",
              target,
            ),
        );
      }
    }
    position(message);
  }
  const pinnedNodes = {};
  window.addEventListener("seruchat-pinned", (e) => {
    const d = e.detail;
    if (!selected || d.id !== selected.id || d.scope !== selected.scope) return;
    let b = pinnedNodes[d.scope];
    if (!b) {
      b = makeButton(
        "",
        () => {
          const n = document.querySelector(
            `[data-message-id="${b.dataset.target}"]`,
          );
          n?.scrollIntoView({ block: "center" });
        },
        "tg-pinned-message",
      );
      pinnedNodes[d.scope] = b;
      el(d.scope === "group" ? "groupMessages" : "messagesList").before(b);
    }
    b.hidden = !d.pinned;
    b.dataset.thread = d.id;
    if (d.pinned) {
      const value = "📌 " + d.pinned.text.slice(0, 110);
      if (b.textContent !== value) b.textContent = value;
      b.dataset.target = d.pinned.id;
    }
  });
  for (const [id, scope] of [
    ["chatSection", "direct"],
    ["groupChatSection", "group"],
  ]) {
    const header = el(id).querySelector(".chat-header");
    const dots = makeButton(
      "⋮",
      () => {
        if (selected) roomMenu(selected, dots);
      },
      "icon-button tg-header-menu",
    );
    dots.replaceChildren(icon("dots"));
    dots.setAttribute("aria-label", "Thao tác cuộc trò chuyện");
    header.append(dots);
    header.querySelector("h2").onclick = () =>
      openInfo().catch((e) => notice(e.message, true));
  }
  const infoDialog = node("dialog", "tg-info"),
    infoTop = node("div", "dialog-top"),
    infoTitle = node("h2"),
    infoTabs = node("nav", "tg-filters"),
    infoContent = node("div", "info-content");
  infoTop.append(
    infoTitle,
    makeButton("✕", () => infoDialog.close()),
  );
  infoDialog.append(infoTop, infoTabs, infoContent);
  document.body.append(infoDialog);
  async function openInfo() {
    if (!selected) return;
    const room = { ...selected },
      gen = generation;
    infoDialog.showModal();
    infoTitle.textContent = room.name || "Thông tin trò chuyện";
    infoContent.replaceChildren(node("p", "muted", "Đang tải…"));
    let profile = null;
    if (room.scope === "direct") {
      const result = await accountApi(
        "/api/profiles/" + (room.peer_id || currentConversationUserId),
      );
      profile = result.profile;
    }
    if (gen !== generation || !infoDialog.open) return;
    const messages = [
      ...el(
        room.scope === "group" ? "groupMessages" : "messagesList",
      ).querySelectorAll(".chat-message:not(.action-event):not(.recalled)"),
    ];
    function tab(kind) {
      for (const b of infoTabs.children)
        b.classList.toggle("active", b.dataset.tab === kind);
      infoContent.replaceChildren();
      if (kind === "info") {
        infoContent.append(avatar(room));
        if (profile) {
          infoContent.append(
            node("h3", "", profile.displayName),
            node("p", "muted", profile.handle ? "@" + profile.handle : ""),
            node("p", "", profile.bio || "Chưa có giới thiệu."),
          );
          const actions = node("div", "info-card");
          for (const original of el("chatActions").querySelectorAll("button"))
            actions.append(
              makeButton(
                original.textContent,
                () => {
                  infoDialog.close();
                  original.click();
                },
                original.className,
              ),
            );
          infoContent.append(actions);
        } else {
          infoContent.append(
            node("p", "", el("groupSubtitle").textContent),
            makeButton("Thành viên & quản lý nhóm", () => {
              infoDialog.close();
              el("groupSettings").click();
            }),
          );
        }
        infoContent.append(
          node(
            "p",
            "muted",
            "Ảnh, tệp và liên kết bên cạnh được tổng hợp từ lịch sử đã tải trên thiết bị này.",
          ),
        );
      } else
        for (const message of messages) {
          const text =
            message.querySelector(".message-text")?.textContent || "";
          const image = message.querySelector("[data-action=preview-file]"),
            download = message.querySelector("[data-action=download-file]");
          if ((kind === "media" && image) || (kind === "files" && download)) {
            const card = node("article", "info-card");
            card.append(
              node("p", "", text),
              makeButton(kind === "media" ? "Xem ảnh" : "Tải về", () => {
                infoDialog.close();
                message.scrollIntoView({ block: "center" });
                (kind === "media" ? image : download).click();
              }),
            );
            infoContent.append(card);
          }
          if (kind === "links")
            for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
              let url;
              try {
                url = new URL(match[0]);
              } catch {
                continue;
              }
              if (
                !["http:", "https:"].includes(url.protocol) ||
                url.username ||
                url.password
              )
                continue;
              const card = node("p", "info-card"),
                a = node("a", "", url.href);
              a.href = url.href;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              card.append(a);
              infoContent.append(card);
            }
        }
      if (!infoContent.children.length)
        infoContent.append(
          node("p", "empty-state", "Chưa có nội dung trong lịch sử đã tải."),
        );
    }
    infoTabs.replaceChildren();
    for (const [k, label] of [
      ["info", "Thông tin"],
      ["media", "Ảnh"],
      ["files", "Tệp"],
      ["links", "Liên kết"],
    ]) {
      const b = makeButton(label, () => tab(k));
      b.dataset.tab = k;
      infoTabs.append(b);
    }
    tab("info");
  }
  const notesDialog = node("dialog", "tg-notes"),
    notesTitle = node("div", "dialog-top");
  notesTitle.append(
    node("h2", "", "Tin nhắn đã lưu"),
    makeButton("✕", () => notesDialog.close()),
  );
  const notesList = node("div");
  notesList.id = "savedList";
  const form = node("form"),
    input = node("textarea");
  input.rows = 3;
  input.placeholder = "Ghi chú riêng tư…";
  input.required = true;
  const submit = node("button", "primary", "Lưu ghi chú");
  submit.type = "submit";
  form.append(input, submit);
  notesDialog.append(notesTitle, notesList, form);
  document.body.append(notesDialog);
  async function personalKey() {
    if (notesKey) return notesKey;
    const gen = generation,
      user = currentUserId.textContent;
    if (!ready || !keyPair) throw Error("Vui lòng đăng nhập lại.");
    const raw = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
    );
    try {
      const k = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
        "deriveKey",
      ]);
      const derived = await crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: new Uint8Array(32),
          info: new TextEncoder().encode("seruchat/saved-notes/v1"),
        },
        k,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      if (gen !== generation || user !== currentUserId.textContent)
        throw Error("Phiên đã thay đổi.");
      notesKey = derived;
      return derived;
    } finally {
      raw.fill(0);
    }
  }
  const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))),
    un64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function saveNote(text) {
    if (!text || new TextEncoder().encode(text).length > 12000)
      throw Error("Ghi chú tối đa 12 KB.");
    const gen = generation,
      user = currentUserId.textContent;
    const id = crypto.randomUUID(),
      iv = crypto.getRandomValues(new Uint8Array(12)),
      aad = new TextEncoder().encode(user + ":" + id),
      ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        await personalKey(),
        new TextEncoder().encode(text),
      );
    if (gen !== generation || user !== currentUserId.textContent) return;
    await accountApi("/api/workspace/notes", {
      id,
      iv: b64(iv),
      ciphertext: b64(ct),
    });
    if (gen !== generation || user !== currentUserId.textContent) return;
    notice("Đã lưu tin nhắn.");
    if (notesDialog.open) await loadNotes();
  }
  async function loadNotes() {
    const gen = generation,
      user = currentUserId.textContent;
    const { notes } = await accountApi("/api/workspace/notes");
    if (gen !== generation || user !== currentUserId.textContent) return;
    const personal = await personalKey();
    if (gen !== generation || user !== currentUserId.textContent) return;
    notesList.replaceChildren();
    for (const n of notes) {
      const card = node("article", "saved-card");
      let text;
      try {
        text = new TextDecoder().decode(
          await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: un64(n.iv),
              additionalData: new TextEncoder().encode(user + ":" + n.id),
            },
            personal,
            un64(n.ciphertext),
          ),
        );
      } catch {
        text = "Không thể mở ghi chú này.";
      }
      if (gen !== generation || user !== currentUserId.textContent) return;
      card.append(
        node("p", "message-text", text),
        makeButton("Sao chép", () => navigator.clipboard.writeText(text)),
        makeButton(
          "Xóa",
          async () => {
            if (
              await confirmAction(
                "Xóa ghi chú?",
                "Chỉ xóa ghi chú đã lưu trong tài khoản của bạn.",
              )
            ) {
              await accountApi("/api/workspace/notes/" + n.id, {}, "DELETE");
              await loadNotes();
            }
          },
          "danger",
        ),
      );
      notesList.append(card);
    }
    if (!notes.length)
      notesList.append(
        node(
          "p",
          "empty-state",
          "Lưu những tin nhắn và ghi chú bạn muốn giữ lại.",
        ),
      );
  }
  async function openNotes() {
    notesDialog.showModal();
    await loadNotes();
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      await saveNote(input.value);
      input.value = "";
    } catch (e) {
      notice(e.message, true);
    } finally {
      submit.disabled = false;
    }
  };
  for (const input of [el("messageInput"), el("groupMessageInput")])
    input.addEventListener("input", () => {
      if (selected)
        ThreadActions.drafts.set(
          selected.scope + ":" + selected.id,
          input.value,
        );
    });
  search.addEventListener("input", draw);
  window.addEventListener("seruchat-ready", () => {
    generation++;
    first = true;
    updateAccount();
    accountApi("/api/admin/state")
      .then(() => (adminItem.hidden = false))
      .catch(() => (adminItem.hidden = true));
    refresh(true);
  });
  window.addEventListener("seruchat-clear", () => {
    adminItem.hidden = true;
    for (const b of Object.values(pinnedNodes)) b.hidden = true;
    ThreadActions.drafts.clear();
    ThreadActions.cancel();
    generation++;
    rooms = [];
    selected = null;
    loadedSelection = null;
    source = "";
    roomSource = "";
    previewCache.clear();
    notesKey = null;
    first = true;
    infoDialog.close();
    previewDialog.close();
    addAccountDialog.close();
    notesDialog.close();
    notesList.replaceChildren();
    input.value = "";
    list.replaceChildren();
    closeMenus();
    showPane("unifiedPane");
  });
  window.addEventListener("seruchat-room", (e) => {
    const room = rooms.find(
      (r) => r.scope === e.detail.scope && r.id === e.detail.id,
    );
    if (room) {
      selected = room;
      draw();
    } else {
      selected = {
        ...e.detail,
        name: el(e.detail.scope === "group" ? "groupTitle" : "chatUser")
          .textContent,
      };
      accountApi(
        "/api/workspace/" + e.detail.scope + "/" + e.detail.id,
        { hide: false },
        "PATCH",
      )
        .then(() => refresh(true))
        .catch((e) => notice(e.message, true));
    }
    for (const b of Object.values(pinnedNodes))
      if (b.dataset.thread !== e.detail.id) b.hidden = true;
    showPane("unifiedPane");
    workspace.classList.add("chat-open");
    loadedSelection = e.detail.scope + ":" + e.detail.id;
    setTimeout(() => markRead(true).catch((e) => notice(e.message, true)), 0);
    const value = ThreadActions.drafts.get(e.detail.scope + ":" + e.detail.id);
    if (value !== undefined) draftInput().value = value;
  });
  window.addEventListener("seruchat-messages", () =>
    setTimeout(() => markRead().catch((e) => notice(e.message, true)), 0),
  );
  setInterval(() => refresh(), 4000);
  window.addEventListener("focus", () => refresh());
  window.addEventListener("seruchat-groups", () => refresh());
  window.addEventListener("seruchat-lists", () => refresh());
  let toast;
  new MutationObserver(() => {
    clearTimeout(toast);
    if (el("operationStatus").textContent)
      toast = setTimeout(() => (el("operationStatus").textContent = ""), 6500);
  }).observe(el("operationStatus"), { childList: true });
  window.addEventListener("offline", () =>
    notice("Mất kết nối. Bạn có thể gửi lại khi có mạng.", true),
  );
  window.addEventListener("online", () => refresh(true));
  for (const [id, name] of [
    ["emojiToggle", "smile"],
    ["groupEmojiToggle", "smile"],
    ["backToList", "back"],
    ["groupBack", "back"],
  ])
    el(id).replaceChildren(icon(name));
  for (const label of document.querySelectorAll(".file-button")) {
    const sr = label.querySelector(".sr-only");
    label.replaceChildren(icon("attach"));
    if (sr) label.append(sr);
  }
  for (const b of document.querySelectorAll(
    "#messageForm button[type=submit],#groupMessageForm button[type=submit]",
  )) {
    b.setAttribute("aria-label", "Gửi tin nhắn");
    b.replaceChildren(icon("send"));
  }
  window.SeruchatWorkspace = {
    refresh,
    openRoom,
    showPane,
    rooms: () => rooms,
  };
})();
