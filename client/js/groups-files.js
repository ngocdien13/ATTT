"use strict";
(() => {
  const v = SeruchatV2;
  let identity = null,
    identityTask = null,
    policy = null,
    group = null,
    generation = 0,
    polling = false,
    sendingGroup = false,
    directVersion = 0,
    lastGroupsSource = "",
    refreshingGroup = null,
    refreshingGroupContext = null,
    refreshingDirect = null,
    refreshingDirectContext = null;
  const opened = new Map(),
    objectUrls = new Set(),
    transfers = new Set(),
    directRows = new Map();
  let directCursor = null;
  function say(message, target = "groupMessageStatus") {
    el(target).textContent = message;
  }
  async function request(url, body, method = "POST") {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : method,
      headers:
        body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "X-CSRF-Token": await csrfToken(),
            },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && ready) clearSession();
      throw Error(result.message || "Không kết nối được server.");
    }
    return result;
  }
  function trustDb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open("seruchat-v2-trust", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("pins");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function pinRecord(key, value, check) {
    const db = await trustDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("pins", "readwrite"),
          store = tx.objectStore("pins"),
          r = store.get(key);
        let result;
        r.onsuccess = () => {
          try {
            check(r.result);
            store.put(value, key);
            result = value;
          } catch (error) {
            tx.abort();
            reject(error);
          }
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  async function trustMember(member, owner = currentUserId.textContent) {
    if (!owner || owner !== currentUserId.textContent || !ready)
      throw Error("Phiên đã thay đổi.");
    const value = {
      encryptionKey: member.encryptionKey,
      signingKey: member.signingKey,
    };
    await pinRecord(owner + ":identity:" + member.id, value, (old) => {
      if (owner !== currentUserId.textContent || !ready)
        throw Error("Phiên đã thay đổi.");
      if (old && v.canonical(old) !== v.canonical(value))
        throw Error(
          "Khóa của thành viên đã thay đổi. Dừng gửi/giải mã; không tự chấp nhận khóa mới.",
        );
    });
  }
  async function ensureIdentity() {
    if (identity) return identity;
    if (!ready || !keyPair)
      throw Error("Cần mở khóa chat cũ trước khi dùng nhóm/file.");
    if (identityTask) return identityTask;
    const userId = currentUserId.textContent,
      myGeneration = generation,
      pair = keyPair;
    identityTask = (async () => {
      let record;
      try {
        record = (await request("/api/v2/identities/" + userId)).identity;
      } catch (error) {
        if (!error.message.includes("thiết lập khóa nhóm/file")) throw error;
        const candidate = await v.identityProof(userId, pair);
        try {
          await request("/api/v2/identities", { record: candidate.record });
          record = candidate.record;
        } catch (error) {
          record = (await request("/api/v2/identities/" + userId)).identity;
        }
      }
      if (myGeneration !== generation || userId !== currentUserId.textContent)
        throw Error("Phiên đã thay đổi.");
      await v.validateIdentity(record);
      const signingPair = await v.restoreIdentity(record, pair);
      await trustMember({ id: userId, ...record }, userId);
      if (myGeneration !== generation || userId !== currentUserId.textContent)
        throw Error("Phiên đã thay đổi.");
      identity = { ...record, pair: signingPair };
      policy = await request("/api/v2/file-policy");
      return identity;
    })().finally(() => {
      identityTask = null;
    });
    return identityTask;
  }
  async function peerIdentity(id, owner = currentUserId.textContent) {
    const { identity: record } = await request("/api/v2/identities/" + id);
    await v.validateIdentity(record);
    const member = v.memberIdentity(
      id,
      record.encryptionKey,
      record.signingKey,
    );
    await trustMember(member, owner);
    return member;
  }
  async function chain(id) {
    const gen = generation,
      mine = currentUserId.textContent;
    const { events } = await request("/api/groups/" + id);
    let pinned;
    const db = await trustDb();
    try {
      pinned = await new Promise((resolve, reject) => {
        const r = db
          .transaction("pins")
          .objectStore("pins")
          .get(currentUserId.textContent + ":group:" + id);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
    const history = await v.verifyChain(events, pinned),
      members = new Map();
    if (history[0].event.document.id !== id)
      throw Error("Server trả dữ liệu của nhóm khác.");
    for (const item of history)
      for (const member of item.event.document.members)
        members.set(member.id, member);
    for (const member of members.values()) {
      await trustMember(member, mine);
      const known = await peerIdentity(member.id, mine);
      if (
        known.encryptionKey !== member.encryptionKey ||
        known.signingKey !== member.signingKey
      )
        throw Error("Directory trả khóa khác với danh sách thành viên đã ký.");
      if (!userCache.has(member.id)) {
        try {
          const result = await request("/api/profiles/" + member.id);
          if (gen === generation && mine === currentUserId.textContent)
            userCache.set(member.id, result.profile.displayName);
        } catch {}
      }
    }
    if (gen !== generation || mine !== currentUserId.textContent)
      throw Error("Phiên đã thay đổi.");
    const last = history.at(-1),
      value = { version: last.event.document.version, hash: last.hash };
    await pinRecord(
      currentUserId.textContent + ":group:" + id,
      value,
      (old) => {
        if (
          old &&
          !history.some(
            (e) =>
              e.hash === old.hash && e.event.document.version === old.version,
          )
        )
          throw Error("Nhóm bị rollback/fork.");
      },
    );
    return history;
  }
  async function refreshGroups() {
    if (!ready) return;
    const mine = currentUserId.textContent,
      gen = generation;
    const [list, invites] = await Promise.all([
      request("/api/groups"),
      request("/api/groups/invitations"),
    ]);
    if (gen !== generation || mine !== currentUserId.textContent) return;
    const source = JSON.stringify([list, invites]);
    if (source === lastGroupsSource) return;
    lastGroupsSource = source;
    window.dispatchEvent(new Event("seruchat-groups"));
    el("groupsList").replaceChildren();
    el("groupInvitations").replaceChildren();
    for (const g of list.groups) {
      const actions = row(
        el("groupsList"),
        g.name,
        (g.active ? "" : "Đã rời · ") +
          ({ owner: "Chủ nhóm", admin: "Quản trị viên", member: "Thành viên" }[
            g.role
          ] || ""),
      );
      button(actions, "Mở nhóm", () => openGroup(g.id), "open-group");
    }
    for (const invite of invites.invitations) {
      const actions = row(
        el("groupInvitations"),
        invite.name,
        "Lời mời cần bạn chấp nhận",
      );
      button(actions, "Tham gia", () => join(invite), "join-group");
      button(
        actions,
        "Từ chối",
        async () => {
          await request("/api/groups/invitations/" + invite.id + "/reject", {});
          await refreshGroups();
        },
        "reject-group",
      );
    }
    empty(el("groupsList"), "Chưa có nhóm.");
    empty(el("groupInvitations"), "Không có lời mời nhóm.");
  }
  function clearViews() {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls.clear();
    opened.clear();
    for (const xhr of transfers) xhr.abort();
    transfers.clear();
  }
  function contextAt(envelope) {
    if (envelope.header.scope === "group")
      return v.groupContext(group.history, envelope.header.membershipVersion);
    return null;
  }
  async function openGroup(id) {
    const navigation = ++viewVersion;
    await ensureIdentity();
    const gen = generation,
      history = await chain(id);
    if (gen !== generation || navigation !== viewVersion) return;
    clearViews();
    currentConversationId = null;
    currentConversationUserId = null;
    directVersion++;
    directRows.clear();
    el("chatSection").hidden = true;
    el("chatWelcome").hidden = true;
    el("groupChatSection").hidden = false;
    document.querySelector(".workspace").classList.add("chat-open");
    group = { id, history, rows: new Map(), cursor: null, renderVersion: 0 };
    el("groupMessages").replaceChildren();
    el("groupMessageInput").value = "";
    el("groupFile").value = "";
    say("");
    await refreshGroup();
    if (navigation !== viewVersion) return;
    window.dispatchEvent(
      new CustomEvent("seruchat-room", { detail: { scope: "group", id } }),
    );
  }
  async function groupHeader() {
    const latest = group.history.at(-1).event.document,
      member = latest.members.find((m) => m.id === currentUserId.textContent);
    if (el("groupTitle").textContent !== latest.name)
      el("groupTitle").textContent = latest.name;
    const subtitle = `${latest.members.length} thành viên`;
    if (el("groupSubtitle").textContent !== subtitle)
      el("groupSubtitle").textContent = subtitle;
    const trust = member
      ? ""
      : "Bạn đã rời nhóm và không nhận được tin nhắn mới.";
    if (el("groupTrust").textContent !== trust)
      el("groupTrust").textContent = trust;
    el("groupMessageInput").disabled = !member;
    el("groupMessageForm").querySelector("button[type=submit]").disabled =
      !member || sendingGroup;
    el("groupFile").disabled = !member;
    if (group.avatarId === latest.avatarId) return;
    if (group.avatarUrl) {
      URL.revokeObjectURL(group.avatarUrl);
      objectUrls.delete(group.avatarUrl);
    }
    group.avatarId = latest.avatarId;
    el("groupAvatar").hidden = true;
    if (latest.avatarId) {
      const current = group.id,
        r = await fetch(`/api/groups/${current}/avatar/${latest.avatarId}`);
      if (!r.ok) return;
      const bytes = await r.arrayBuffer();
      if ((await v.digest(bytes)) !== latest.avatarHash)
        throw Error("Ảnh nhóm bị thay đổi.");
      if (!group || group.id !== current) return;
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "image/webp" }),
      );
      objectUrls.add(url);
      group.avatarUrl = url;
      el("groupAvatar").src = url;
      el("groupAvatar").hidden = false;
    }
  }
  async function refreshGroup(older = false) {
    const context = group;
    if (refreshingGroup) {
      const oldContext = refreshingGroupContext;
      await refreshingGroup;
      if (!older && oldContext === context) return;
    }
    if (context !== group) return;
    const task = refreshGroupNow(older);
    refreshingGroup = task;
    refreshingGroupContext = context;
    try {
      await task;
    } finally {
      if (refreshingGroup === task) refreshingGroup = null;
    }
  }
  async function refreshGroupNow(older = false) {
    if (!group || !ready) return;
    const current = group,
      gen = generation,
      token = ++current.renderVersion;
    const history = await chain(current.id);
    if (group !== current || gen !== generation) return;
    current.history = history;
    await groupHeader();
    const page = await request(
      `/api/v2/history/group/${current.id}${older && current.cursor ? "?before=" + encodeURIComponent(current.cursor) : ""}`,
    );
    if (
      group !== current ||
      gen !== generation ||
      token !== current.renderVersion
    )
      return;
    if (older || !current.rows.size) current.cursor = page.next;
    for (const message of page.messages) current.rows.set(message.id, message);
    el("groupOlder").hidden = !current.cursor;
    const list = el("groupMessages"),
      near = list.scrollHeight - list.scrollTop - list.clientHeight < 70,
      oldHeight = list.scrollHeight,
      oldScroll = list.scrollTop,
      ordered = [];
    for (const message of [...current.rows.values()].sort(compareRows)) {
      const node = await render(
        message,
        history.some(
          (item) =>
            item.event.document.version ===
            message.envelope?.header?.membershipVersion,
        )
          ? v.groupContext(history, message.envelope.header.membershipVersion)
          : v.groupContext(history),
      );
      if (group !== current || token !== current.renderVersion) return;
      ordered.push(node);
    }
    syncMessageNodes(list, ordered);
    if (el("v2Status").textContent) say("", "v2Status");
    empty(list, "Gửi lời chào đến cả nhóm nhé!");
    if (older) list.scrollTop = oldScroll + list.scrollHeight - oldHeight;
    else if (near) list.scrollTop = list.scrollHeight;
  }
  function syncMessageNodes(list, nodes) {
    if (nodes.length) list.querySelector(".empty-state")?.remove();
    let cursor = list.firstElementChild;
    for (const node of nodes) {
      if (node === cursor) cursor = cursor.nextElementSibling;
      else list.insertBefore(node, cursor);
    }
    window.ThreadActions?.project(list);
    for (const node of [...list.children])
      if (!nodes.includes(node)) node.remove();
  }
  function compareRows(a, b) {
    return (
      String(a.created_at).localeCompare(String(b.created_at)) ||
      String(a.id).localeCompare(String(b.id))
    );
  }
  async function render(message, context) {
    const gen = generation;
    const e = message.envelope,
      source = v.canonical(e),
      cacheKey = context.scope + ":" + message.id;
    const old = opened.get(cacheKey);
    if (old?.source === source) {
      old.node.dataset.created = message.created_at;
      return old.node;
    }
    if (old) {
      for (const url of old.urls) {
        URL.revokeObjectURL(url);
        objectUrls.delete(url);
      }
      opened.delete(cacheKey);
    }
    const node = document.createElement("div");
    node.className =
      "chat-message" +
      (e?.header?.senderId === currentUserId.textContent ? " mine" : "");
    node.dataset.created = message.created_at;
    node.dataset.messageId = message.id;
    const urls = [];
    try {
      if (!e?.header || message.id !== e.header.id)
        throw Error("Message ID bị đổi.");
      const result = await v.openEnvelope(
        e,
        context,
        currentUserId.textContent,
        keyPair.privateKey,
      );
      if (gen !== generation) return document.createElement("div");
      paragraph(
        node,
        userCache.get(e.header.senderId) || "Thành viên",
        "message-sender",
      );
      node.dataset.verified = "true";
      node.dataset.sender = e.header.senderId;
      node.dataset.kind = e.header.type;
      node.dataset.canPin = String(
        context.scope === "direct" ||
          ["owner", "admin"].includes(
            context.members.find((m) => m.id === currentUserId.textContent)
              ?.role,
          ),
      );
      if (e.header.type === "text")
        paragraph(node, result.payload.text, "message-text");
      else {
        const metadata = result.payload;
        const name = safeName(metadata.name);
        paragraph(node, name, "message-text");
        paragraph(node, formatBytes(metadata.size), "list-detail");
        const status = paragraph(node, "", "file-status");
        button(
          node,
          "Tải về",
          () => receiveFile(e, result, name, status, false, node, urls),
          "download-file",
        );
        if (["png", "jpg", "jpeg", "webp"].includes(extension(name)))
          button(
            node,
            "Xem ảnh",
            () => receiveFile(e, result, name, status, true, node, urls),
            "preview-file",
          );
      }
    } catch (error) {
      paragraph(
        node,
        "Không thể xác minh/giải mã tin nhắn này.",
        "message-text error",
      );
    }
    window.ThreadActions?.remember(node, message, context);
    const time = document.createElement("time");
    time.textContent = new Date(message.created_at).toLocaleTimeString(
      "vi-VN",
      { hour: "2-digit", minute: "2-digit" },
    );
    time.title = new Date(message.created_at).toLocaleString("vi-VN");
    node.append(time);
    if (gen !== generation) return document.createElement("div");
    opened.set(cacheKey, { source, node, urls });
    return node;
  }
  function extension(name) {
    return name.split(".").at(-1).toLowerCase();
  }
  function safeName(name) {
    const result = name
      .replaceAll("\\", "/")
      .split("/")
      .at(-1)
      .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069\u200e\u200f]/g, "")
      .slice(0, 255);
    return result || "download.bin";
  }
  function formatBytes(n) {
    return n >= 1024 * 1024
      ? (n / (1024 * 1024)).toFixed(1) + " MB"
      : Math.ceil(n / 1024) + " KB";
  }
  function binaryTransfer(method, url, body, onProgress, expectedBytes = null) {
    if (method === "GET")
      return (async () => {
        const controller = new AbortController();
        transfers.add(controller);
        try {
          if (
            !Number.isSafeInteger(expectedBytes) ||
            expectedBytes < 16 ||
            expectedBytes > 50 * 1024 * 1024 + 16
          )
            throw Error("Kích thước file ngoài giới hạn.");
          const r = await fetch(url, { signal: controller.signal });
          if (!r.ok)
            throw Error(
              "Không có quyền tải file hoặc file không còn trong kho.",
            );
          const length = r.headers.get("Content-Length");
          if (length && Number(length) !== expectedBytes)
            throw Error("Kích thước phản hồi không khớp envelope đã ký.");
          const reader = r.body.getReader(),
            chunks = [];
          let total = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > expectedBytes)
              throw Error("Server gửi dữ liệu vượt kích thước đã ký.");
            chunks.push(value);
            onProgress(total, expectedBytes);
          }
          if (total !== expectedBytes) throw Error("Tải file chưa đủ.");
          const result = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
          }
          return result.buffer;
        } finally {
          controller.abort();
          transfers.delete(controller);
        }
      })();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      transfers.add(xhr);
      xhr.open(method, url);
      xhr.responseType = method === "GET" ? "arraybuffer" : "json";
      if (method === "PUT") {
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.upload.onprogress = (e) =>
          onProgress(e.loaded, e.total || body.byteLength);
      } else xhr.onprogress = (e) => onProgress(e.loaded, e.total);
      xhr.onload = () => {
        transfers.delete(xhr);
        if (xhr.status < 200 || xhr.status >= 300) {
          let m = xhr.response?.message;
          if (xhr.response instanceof ArrayBuffer) {
            try {
              m = JSON.parse(new TextDecoder().decode(xhr.response)).message;
            } catch {}
          }
          reject(Error(m || "Không tải được file."));
        } else resolve(xhr.response);
      };
      xhr.onerror = () => {
        transfers.delete(xhr);
        reject(Error("Mất kết nối khi tải file. Bạn có thể thử lại."));
      };
      xhr.onabort = () => {
        transfers.delete(xhr);
        reject(Error("Đã hủy tải file."));
      };
      if (method === "PUT")
        csrfToken()
          .then((t) => {
            if (!ready) {
              transfers.delete(xhr);
              xhr.abort();
              reject(Error("Phiên đã đóng."));
              return;
            }
            xhr.setRequestHeader("X-CSRF-Token", t);
            xhr.send(body);
          })
          .catch(reject);
      else xhr.send();
    });
  }
  function previewDimensions(b) {
    const be = (i) => b[i] * 256 + b[i + 1],
      le = (i) => b[i] + b[i + 1] * 256,
      ascii = (i, n) => String.fromCharCode(...b.slice(i, i + n));
    let w = 0,
      h = 0;
    if (
      b.length >= 24 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => b[i] === x) &&
      ascii(12, 4) === "IHDR"
    ) {
      const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
      w = view.getUint32(16);
      h = view.getUint32(20);
    } else if (
      b.length >= 30 &&
      ascii(0, 4) === "RIFF" &&
      ascii(8, 4) === "WEBP"
    ) {
      if (ascii(12, 4) === "VP8X") {
        w = 1 + b[24] + b[25] * 256 + b[26] * 65536;
        h = 1 + b[27] + b[28] * 256 + b[29] * 65536;
      } else if (
        ascii(12, 4) === "VP8 " &&
        b[23] === 157 &&
        b[24] === 1 &&
        b[25] === 42
      ) {
        w = le(26) & 16383;
        h = le(28) & 16383;
      } else if (ascii(12, 4) === "VP8L" && b[20] === 47) {
        const n =
          (b[21] + b[22] * 256 + b[23] * 65536 + b[24] * 16777216) >>> 0;
        w = 1 + (n & 16383);
        h = 1 + ((n >>> 14) & 16383);
      }
    } else if (b[0] === 255 && b[1] === 216) {
      let i = 2;
      while (i + 8 < b.length) {
        if (b[i++] !== 255) break;
        while (b[i] === 255) i++;
        const marker = b[i++];
        if (marker === 218 || marker === 217) break;
        const n = be(i);
        if (n < 2 || i + n > b.length) break;
        if (
          [
            192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
          ].includes(marker)
        ) {
          h = be(i + 3);
          w = be(i + 5);
          break;
        }
        i += n;
      }
    }
    if (!w || !h || w * h > 16000000)
      throw Error(
        "Preview chỉ nhận PNG/JPEG/WebP hợp lệ, tối đa 16 triệu điểm ảnh.",
      );
    return { width: w, height: h };
  }
  async function receiveFile(e, result, name, status, preview, node, urls) {
    const gen = generation;
    status.textContent = "Đang gửi…";
    const binary = await binaryTransfer(
      "GET",
      "/api/attachments/" + e.header.attachmentId + "/content",
      null,
      (loaded, total) => {
        status.textContent = total
          ? `Đang tải ${Math.round((loaded / total) * 100)}%`
          : "Đang tải…";
      },
      e.file.bytes,
    ).catch((error) => {
      status.textContent = error.message;
      throw error;
    });
    if (gen !== generation) return;
    const data = await v.openFile(e, result, binary).catch((error) => {
      status.textContent = error.message;
      throw error;
    });
    if (gen !== generation) return;
    status.textContent = "Đã xác minh và giải mã.";
    if (!policy.allowedExtensions.includes(extension(name)))
      throw Error("Định dạng không được cho phép trên thiết bị này.");
    if (preview) {
      let bitmap;
      try {
        previewDimensions(new Uint8Array(data));
        bitmap = await createImageBitmap(new Blob([data]));
        if (bitmap.width * bitmap.height > 16000000)
          throw Error("Ảnh quá nhiều điểm ảnh.");
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(1200, bitmap.width);
        canvas.height = Math.max(
          1,
          Math.round((bitmap.height * canvas.width) / bitmap.width),
        );
        canvas
          .getContext("2d")
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
        if (!blob) throw Error("Ảnh không hợp lệ.");
        const url = URL.createObjectURL(blob);
        objectUrls.add(url);
        urls.push(url);
        const image = document.createElement("img");
        image.className = "decrypted-preview";
        image.alt = name;
        image.src = url;
        node.append(image);
      } catch (error) {
        status.textContent = error.message;
        throw error;
      } finally {
        bitmap?.close();
      }
    } else {
      const url = URL.createObjectURL(
        new Blob([data], { type: "application/octet-stream" }),
      );
      objectUrls.add(url);
      urls.push(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        objectUrls.delete(url);
      }, 30000);
    }
  }
  async function directContext() {
    await ensureIdentity();
    if (!currentConversationId) throw Error("Chọn chat trước.");
    const selected = currentConversationId,
      peer = currentConversationUserId,
      mine = currentUserId.textContent;
    const { context } = await request(
      "/api/v2/direct/" + selected + "/context",
    );
    if (
      context.scope !== "direct" ||
      context.id !== selected ||
      context.members.length !== 2 ||
      !context.members.some((m) => m.id === peer) ||
      !context.members.some((m) => m.id === currentUserId.textContent)
    )
      throw Error("Server trả sai cuộc trò chuyện.");
    for (const m of context.members) await trustMember(m, mine);
    const expected = await v.directContext(context.id, context.members);
    if (expected.hash !== context.hash)
      throw Error("Direct context không hợp lệ.");
    return context;
  }
  async function sendFile(file, scope) {
    const gen = generation,
      progress = el(scope === "group" ? "groupProgress" : "directProgress"),
      target = scope === "group" ? "groupMessageStatus" : "messageStatus";
    let reserved = null;
    try {
      await ensureIdentity();
      if (file.size > policy.maxFileBytes)
        throw Error("Tệp tối đa " + formatBytes(policy.maxFileBytes) + ".");
      const name = safeName(file.name);
      if (!policy.allowedExtensions.includes(extension(name)))
        throw Error("Loại tệp chưa được hỗ trợ.");
      say("Đang chuẩn bị tệp…", target);
      const context =
        scope === "group"
          ? v.groupContext(await chain(group.id))
          : await directContext();
      const { envelope, binary } = await v.sealFile(
        context,
        currentUserId.textContent,
        identity.pair.privateKey,
        await file.arrayBuffer(),
        { name, mime: file.type || "application/octet-stream" },
      );
      if (gen !== generation) return;
      reserved = envelope.header.attachmentId;
      await request("/api/attachments", {
        id: reserved,
        scope,
        scopeId: context.id,
        membershipVersion: context.version,
        rosterHash: context.hash,
        bytes: binary.length,
        hash: envelope.file.hash,
      });
      progress.hidden = false;
      progress.value = 0;
      await binaryTransfer(
        "PUT",
        "/api/attachments/" + reserved + "/content",
        binary,
        (loaded, total) => {
          progress.value = total ? (loaded / total) * 100 : 0;
          say(`Đang gửi ${Math.round(progress.value)}%`, target);
        },
      );
      if (gen !== generation) return;
      await request("/api/v2/messages", { envelope });
      reserved = null;
      say("Đã gửi tệp.", target);
      if (scope === "group") await refreshGroup();
      else await refreshDirectFiles();
    } catch (error) {
      say(error.message, target);
      if (reserved && ready)
        await request("/api/attachments/" + reserved, {}, "DELETE").catch(
          () => {},
        );
    } finally {
      progress.hidden = true;
    }
  }
  async function refreshDirectFiles(older = false) {
    const context = currentConversationId;
    if (refreshingDirect) {
      const oldContext = refreshingDirectContext;
      await refreshingDirect;
      if (!older && oldContext === context) return;
    }
    if (context !== currentConversationId) return;
    const task = refreshDirectFilesNow(older);
    refreshingDirect = task;
    refreshingDirectContext = context;
    try {
      await task;
    } finally {
      if (refreshingDirect === task) refreshingDirect = null;
    }
  }
  async function refreshDirectFilesNow(older = false) {
    if (!ready || !currentConversationId || !identity) return;
    const id = currentConversationId,
      version = directVersion,
      gen = generation;
    const page = await request(
      "/api/v2/history/direct/" +
        id +
        (older && directCursor
          ? "?before=" + encodeURIComponent(directCursor)
          : ""),
    );
    if (
      id !== currentConversationId ||
      gen !== generation ||
      version !== directVersion
    )
      return;
    if (!page.messages.length && !directRows.size) {
      el("directFilesOlder").hidden = true;
      return;
    }
    const directList = el("messagesList"),
      near =
        directList.scrollHeight -
          directList.scrollTop -
          directList.clientHeight <
        80,
      oldHeight = directList.scrollHeight,
      oldScroll = directList.scrollTop;
    const ctx = await directContext();
    if (
      id !== currentConversationId ||
      gen !== generation ||
      version !== directVersion
    )
      return;
    if (older || !directRows.size) directCursor = page.next;
    for (const m of page.messages) directRows.set(m.id, m);
    el("directFilesOlder").hidden = !directCursor;
    for (const m of [...directRows.values()].sort(compareRows)) {
      const node = await render(m, ctx);
      if (
        id !== currentConversationId ||
        gen !== generation ||
        version !== directVersion
      )
        return;
      const list = el("messagesList"),
        old = list.querySelector(`[data-message-id="${m.id}"]`);
      if (old !== node) {
        list.querySelector(".empty-state")?.remove();
        if (old) old.replaceWith(node);
        else list.append(node);
      }
    }
    const nodes = [
      ...el("messagesList").querySelectorAll(".chat-message"),
    ].sort(
      (a, b) =>
        (a.dataset.created || "").localeCompare(b.dataset.created || "") ||
        (a.dataset.messageId || "").localeCompare(b.dataset.messageId || ""),
    );
    syncMessageNodes(el("messagesList"), nodes);
    if (older)
      directList.scrollTop = oldScroll + directList.scrollHeight - oldHeight;
    else if (near) directList.scrollTop = directList.scrollHeight;
    const q = el("messageSearch").value.toLowerCase();
    for (const n of nodes)
      n.hidden = !n
        .querySelector(".message-text")
        .textContent.toLowerCase()
        .includes(q);
  }
  async function postChange(action, modify, invitation = null) {
    await ensureIdentity();
    const history = await chain(group.id),
      previous = history.at(-1),
      old = previous.event.document;
    const document = v.rosterDocument({
      ...old,
      version: old.version + 1,
      prevHash: previous.hash,
      actorId: currentUserId.textContent,
      action,
      invitation,
      ...modify(old),
    });
    const event = await v.signedEvent(document, identity.pair.privateKey);
    await v.validateEvent(event, history);
    await request("/api/groups/" + group.id + "/events", { event });
    group.history = await chain(group.id);
    await refreshGroups();
    await refreshGroup();
    await settings();
  }
  async function join(invite) {
    await ensureIdentity();
    const history = await chain(invite.group_id),
      old = history.at(-1),
      d = old.event.document;
    await v.validateInvitation(invite.invitation, history);
    if (invite.invitation.document.expiresAt <= Date.now())
      throw Error("Lời mời đã hết hạn.");
    const member = await peerIdentity(currentUserId.textContent);
    const document = v.rosterDocument({
      ...d,
      version: d.version + 1,
      prevHash: old.hash,
      actorId: currentUserId.textContent,
      action: "join",
      members: [...d.members, member],
      invitation: invite.invitation,
    });
    const event = await v.signedEvent(document, identity.pair.privateKey);
    await request("/api/groups/" + invite.group_id + "/events", { event });
    await refreshGroups();
    await openGroup(invite.group_id);
  }
  async function settings() {
    if (!group) return;
    const history = await chain(group.id);
    group.history = history;
    const d = history.at(-1).event.document,
      mine = d.members.find((m) => m.id === currentUserId.textContent),
      admin = mine && ["owner", "admin"].includes(mine.role);
    el("editGroupName").value = d.name;
    el("editGroupDescription").value = d.description;
    for (const id of [
      "groupMetadataForm",
      "groupAvatarForm",
      "groupInviteForm",
    ])
      el(id).hidden = !admin;
    el("leaveGroup").hidden = !mine;
    el("leaveGroup").disabled = mine?.role === "owner";
    el("leaveGroupHint").hidden = mine?.role !== "owner";
    el("groupMembers").replaceChildren();
    for (const member of d.members) {
      const actions = row(
        el("groupMembers"),
        userCache.get(member.id) || "Thành viên",
        { owner: "Chủ nhóm", admin: "Quản trị viên", member: "Thành viên" }[
          member.role
        ] || "",
      );
      actions.parentElement.dataset.memberId = member.id;
      if (
        admin &&
        member.id !== currentUserId.textContent &&
        member.role !== "owner" &&
        (mine.role === "owner" || member.role === "member")
      )
        button(
          actions,
          "Xóa khỏi nhóm",
          async () => {
            if (
              await confirmAction(
                "Xóa thành viên?",
                "Người này sẽ không có khóa tin mới; tin cũ họ đã đọc không bị thu hồi.",
              )
            )
              await postChange("remove", (d) => ({
                members: d.members.filter((m) => m.id !== member.id),
              }));
          },
          "remove-member",
          true,
        );
      if (mine?.role === "owner" && member.id !== mine.id) {
        button(
          actions,
          member.role === "admin" ? "Gỡ quyền quản trị" : "Thêm quản trị viên",
          () =>
            postChange("roles", (d) => ({
              members: d.members.map((m) =>
                m.id === member.id
                  ? { ...m, role: m.role === "admin" ? "member" : "admin" }
                  : m,
              ),
            })),
          "role-member",
        );
        button(
          actions,
          "Chuyển chủ sở hữu",
          async () => {
            if (
              await confirmAction(
                "Chuyển chủ sở hữu?",
                "Bạn sẽ thành quản trị viên. Chủ sở hữu mới có quyền quản lý vai trò và xóa bạn.",
              )
            )
              await postChange("transfer", (d) => ({
                members: d.members.map((m) => ({
                  ...m,
                  role:
                    m.id === member.id
                      ? "owner"
                      : m.id === mine.id
                        ? "admin"
                        : m.role,
                })),
              }));
          },
          "transfer-owner",
        );
      }
    }
  }
  function work(id, fn, target = "groupSettingsStatus") {
    const node = el(id);
    node.addEventListener(
      node.tagName === "FORM" ? "submit" : "click",
      async (e) => {
        e.preventDefault();
        const button =
          node.tagName === "FORM"
            ? node.querySelector("button[type=submit]")
            : node;
        if (button.disabled) return;
        button.disabled = true;
        try {
          await fn();
        } catch (error) {
          say(error.message, target);
        } finally {
          button.disabled =
            id === "groupMessageForm"
              ? !ready ||
                !group ||
                !group.history
                  .at(-1)
                  .event.document.members.some(
                    (m) => m.id === currentUserId.textContent,
                  )
              : false;
        }
      },
    );
  }
  work(
    "newGroup",
    async () => {
      await ensureIdentity();
      el("createGroupStatus").textContent = "";
      el("createGroupDialog").showModal();
    },
    "v2Status",
  );
  el("closeCreateGroup").onclick = () => el("createGroupDialog").close();
  work(
    "createGroupForm",
    async () => {
      await ensureIdentity();
      const id = crypto.randomUUID(),
        me = await peerIdentity(currentUserId.textContent);
      const doc = v.rosterDocument({
        id,
        actorId: me.id,
        name: el("newGroupName").value.trim(),
        description: el("newGroupDescription").value,
        members: [{ ...me, role: "owner" }],
      });
      await request("/api/groups", {
        event: await v.signedEvent(doc, identity.pair.privateKey),
      });
      el("createGroupDialog").close();
      el("createGroupForm").reset();
      await refreshGroups();
      await openGroup(id);
    },
    "createGroupStatus",
  );
  work("groupSettings", async () => {
    el("groupSettingsStatus").textContent = "";
    await settings();
    el("groupSettingsDialog").showModal();
  });
  el("closeGroupSettings").onclick = () => el("groupSettingsDialog").close();
  work("groupMetadataForm", async () => {
    await postChange("update", () => ({
      name: el("editGroupName").value.trim(),
      description: el("editGroupDescription").value,
    }));
    say("Đã lưu thông tin nhóm.", "groupSettingsStatus");
  });
  work("groupAvatarForm", async () => {
    const f = el("groupAvatarFile").files[0];
    if (!f || f.size > 2 * 1024 * 1024) throw Error("Ảnh tối đa 2 MB.");
    const r = await fetch("/api/groups/" + group.id + "/avatar", {
      method: "PUT",
      headers: { "Content-Type": f.type, "X-CSRF-Token": await csrfToken() },
      body: f,
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.message);
    await postChange("update", () => ({
      avatarId: data.avatarId,
      avatarHash: data.hash,
    }));
    say("Đã cập nhật ảnh nhóm.", "groupSettingsStatus");
  });
  work("groupInviteForm", async () => {
    const { users } = await request(
      "/api/profiles/search?q=" +
        encodeURIComponent(el("groupInviteHandle").value),
    );
    el("groupInviteResults").replaceChildren();
    for (const u of users) {
      const actions = row(
        el("groupInviteResults"),
        u.displayName,
        "@" + u.handle,
      );
      button(
        actions,
        "Mời vào nhóm",
        async (inviteButton) => {
          await peerIdentity(u.id);
          const history = await chain(group.id),
            d = {
              v: 2,
              id: crypto.randomUUID(),
              groupId: group.id,
              inviterId: currentUserId.textContent,
              inviteeId: u.id,
              issuedHash: history.at(-1).hash,
              expiresAt: Date.now() + 6 * 86400000,
            };
          const invitation = {
            document: d,
            signature: await v.sign(
              "seruchat/invitation/v2",
              d,
              identity.pair.privateKey,
            ),
          };
          await request("/api/groups/" + group.id + "/invitations", {
            invitation,
          });
          inviteButton.dataset.completed = "true";
          inviteButton.textContent = "Đã mời";
          say(
            "Đã mời. Người nhận cần chấp nhận tại tab Nhóm.",
            "groupSettingsStatus",
          );
        },
        "invite-group",
      );
    }
    empty(el("groupInviteResults"), "Không tìm thấy handle.");
  });
  work("leaveGroup", async () => {
    if (
      !(await confirmAction(
        "Rời nhóm?",
        "Bạn sẽ không nhận được tin nhắn mới. Chủ nhóm cần chuyển quyền trước khi rời.",
      ))
    )
      return;
    await postChange("leave", (d) => ({
      members: d.members.filter((m) => m.id !== currentUserId.textContent),
    }));
    el("groupSettingsDialog").close();
  });
  work("groupOlder", () => refreshGroup(true), "groupMessageStatus");
  work("directFilesOlder", () => refreshDirectFiles(true), "messageStatus");
  work(
    "groupMessageForm",
    async () => {
      if (sendingGroup) return;
      sendingGroup = true;
      try {
        const selected = group,
          gen = generation,
          text = el("groupMessageInput").value.trim();
        if (!text || !selected) return;
        const composed =
          window.ThreadActions?.compose("group", selected.id, text) || text;
        await ensureIdentity();
        const history = await chain(selected.id),
          ctx = v.groupContext(history);
        if (gen !== generation) return;
        const envelope = await v.sealText(
          ctx,
          currentUserId.textContent,
          identity.pair.privateKey,
          composed,
        );
        await request("/api/v2/messages", { envelope });
        window.ThreadActions?.sent("group", selected.id);
        if (window.ThreadActions?.drafts.get("group:" + selected.id) === text)
          window.ThreadActions.drafts.delete("group:" + selected.id);
        if (group !== selected || gen !== generation) return;
        if (el("groupMessageInput").value.trim() === text)
          el("groupMessageInput").value = "";
        say("Đã gửi.");
        await refreshGroup();
      } finally {
        sendingGroup = false;
        if (group) await groupHeader();
      }
    },
    "groupMessageStatus",
  );
  el("groupMessageInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      el("groupMessageForm").requestSubmit();
    }
  });
  for (const [id, scope] of [
    ["groupFile", "group"],
    ["directFile", "direct"],
  ])
    el(id).addEventListener("change", async () => {
      const input = el(id),
        file = input.files[0];
      if (!file) return;
      input.disabled = true;
      try {
        await sendFile(file, scope);
      } catch (error) {
        say(
          error.message,
          scope === "group" ? "groupMessageStatus" : "messageStatus",
        );
      } finally {
        input.disabled = false;
        input.value = "";
        if (scope === "direct") updateSendState();
      }
    });
  for (const emoji of [
    "😀",
    "😂",
    "🥰",
    "👍",
    "🙏",
    "💛",
    "🎉",
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
      const input = el("groupMessageInput");
      if (!input.disabled) {
        input.setRangeText(
          emoji,
          input.selectionStart,
          input.selectionEnd,
          "end",
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
        el("groupEmojiPicker").hidden = true;
        el("groupEmojiToggle").setAttribute("aria-expanded", "false");
        input.focus();
      }
    });
    el("groupEmojiPicker").append(b);
  }
  el("groupEmojiToggle").onclick = () => {
    el("groupEmojiPicker").hidden = !el("groupEmojiPicker").hidden;
    el("groupEmojiToggle").setAttribute(
      "aria-expanded",
      String(!el("groupEmojiPicker").hidden),
    );
  };
  el("groupBack").onclick = () =>
    document.querySelector(".workspace").classList.remove("chat-open");
  window.addEventListener("seruchat-ready", () =>
    ensureIdentity()
      .then(() => refreshGroups())
      .then(() => {
        say("", "v2Status");
        el("newGroup").disabled = false;
      })
      .catch((e) => say(e.message, "v2Status")),
  );
  window.addEventListener("seruchat-direct-open", () => {
    directVersion++;
    group = null;
    directRows.clear();
    directCursor = null;
    clearViews();
    el("groupChatSection").hidden = true;
    el("directFilesOlder").hidden = true;
  });
  window.addEventListener("seruchat-messages", () =>
    refreshDirectFiles().catch((e) => {
      if (identity) say(e.message, "messageStatus");
    }),
  );
  window.addEventListener("seruchat-clear", () => {
    el("newGroup").disabled = true;
    lastGroupsSource = "";
    generation++;
    directVersion++;
    identity = null;
    identityTask = null;
    policy = null;
    group = null;
    directRows.clear();
    clearViews();
    el("groupMessages").replaceChildren();
    el("groupChatSection").hidden = true;
    el("groupMessageInput").value = "";
    el("groupFile").value = "";
    el("directFile").value = "";
    for (const id of ["groupSettingsDialog", "createGroupDialog"])
      el(id).close();
  });
  if (ready)
    ensureIdentity()
      .then(() => refreshGroups())
      .catch((e) => say(e.message, "v2Status"));
  setInterval(async () => {
    if (!ready || polling || document.hidden || el("confirmDialog").open)
      return;
    polling = true;
    try {
      await refreshGroups();
      if (group && !el("groupSettingsDialog").open) await refreshGroup();
    } catch (error) {
      if (ready) say(error.message, "v2Status");
    } finally {
      polling = false;
    }
  }, 4000);
  window.SeruchatChat = {
    openGroup,
    async sendDirect(id, text) {
      await ensureIdentity();
      const ctx = await directContext();
      if (ctx.id !== id) throw Error("Cuộc trò chuyện đã thay đổi.");
      const envelope = await v.sealText(
        ctx,
        currentUserId.textContent,
        identity.pair.privateKey,
        text,
      );
      await request("/api/v2/messages", { envelope });
      await refreshDirectFiles();
    },
    async sendEvent(scope, id, text) {
      await ensureIdentity();
      const ctx =
        scope === "group"
          ? v.groupContext(await chain(id))
          : await directContext();
      if (ctx.id !== id) throw Error("Cuộc trò chuyện đã thay đổi.");
      const envelope = await v.sealText(
        ctx,
        currentUserId.textContent,
        identity.pair.privateKey,
        text,
      );
      await request("/api/v2/messages", { envelope });
      if (scope === "group") await refreshGroup();
      else await refreshDirectFiles();
    },
    async preview(room) {
      await ensureIdentity();
      if (!room.last) return "";
      if (room.last.kind === "legacy") {
        return room.last.sender_id === currentUserId.textContent
          ? await decryptOwnMessage(room.last, keyPair.privateKey)
          : await decryptMessage(room.last, keyPair.privateKey);
      }
      const m = room.last,
        ctx =
          room.scope === "group"
            ? v.groupContext(
                await chain(room.id),
                m.envelope.header.membershipVersion,
              )
            : await (async () => {
                const data = await request(
                  "/api/v2/direct/" + room.id + "/context",
                );
                for (const member of data.context.members)
                  await trustMember(member);
                return data.context;
              })();
      const result = await v.openEnvelope(
        m.envelope,
        ctx,
        currentUserId.textContent,
        keyPair.privateKey,
      );
      return m.envelope.header.type === "file"
        ? "📎 " + safeName(result.payload.name)
        : window.ThreadActions?.preview(result.payload.text) ||
            result.payload.text;
    },
  };
})();
