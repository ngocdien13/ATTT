const el = (id) => document.getElementById(id);
// Binding used by the unchanged original sendEncryptedMessage function.
const currentUserId = el("currentUserId");
let sessionPassword = null,
  currentConversationId = null,
  currentConversationUserId = null;
let currentFriendshipStatus = null,
  currentBlockedBy = null;
let ready = false,
  refreshing = false,
  sending = false,
  openingChat = false,
  keyPair = null;
let viewVersion = 0,
  listVersion = 0,
  found = null;
let historyRows = new Map(),
  historyCursor = null,
  loadingOlder = false;
const userCache = new Map(),
  plaintextCache = new HistoryCache();
let lastListsSource = "",
  lastActionsSource = "";
const messageNodes = new Map();
class CancelledAction extends Error {}
function notice(message, error = false) {
  el("operationStatus").textContent = message;
  el("operationStatus").classList.toggle("error", error);
}
function report(error, target) {
  if (error instanceof CancelledAction) return;
  if (target) el(target).textContent = error.message;
  notice(error.message, true);
}
function confirmAction(title, description) {
  const dialog = el("confirmDialog");
  if (dialog.open) return Promise.resolve(false);
  el("confirmTitle").textContent = title;
  el("confirmDescription").textContent = description;
  dialog.returnValue = "no";
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "yes"),
      { once: true },
    );
    dialog.showModal();
    el("confirmNo").focus();
  });
}
function confirmationFor(url, body) {
  const name =
    userCache.get(body.targetUserId || body.friendId) ||
    found?.user.username ||
    "người dùng này";
  if (url.endsWith("/auth/register"))
    return [
      "Tạo tài khoản?",
      "Bạn xác nhận tạo tài khoản với thông tin vừa nhập?",
    ];
  if (url.endsWith("/auth/login"))
    return ["Đăng nhập?", "Bạn xác nhận đăng nhập tài khoản này?"];
  if (url.endsWith("/auth/logout"))
    return ["Đăng xuất?", "Bạn sẽ cần đăng nhập lại để tiếp tục chat."];
  if (url.endsWith("/friendships/request"))
    return [
      "Gửi lời mời kết bạn?",
      `Gửi lời mời đến ${name}? Người nhận cần chấp nhận trước khi nhắn tin.`,
    ];
  if (url.endsWith("/friendships/block"))
    return [
      "Chặn người dùng?",
      `Chặn ${name}? Hai bên sẽ không gửi được tin mới. Lịch sử chat được giữ lại.`,
    ];
  if (url.endsWith("/friendships/unblock"))
    return [
      "Bỏ chặn?",
      `Bỏ chặn ${name}? Nếu hai bên là bạn trước khi chặn, tình bạn được khôi phục. Nếu chưa là bạn, cần gửi lời mời mới.`,
    ];
  if (url.endsWith("/friendships/remove"))
    return [
      "Xóa bạn?",
      `Xóa ${name} khỏi danh sách bạn? Lịch sử chat vẫn còn. Hai bên cần kết bạn lại để gửi tin mới.`,
    ];
  if (url.endsWith("/accept"))
    return [
      "Chấp nhận kết bạn?",
      "Hai bên sẽ có thể nhắn tin sau khi bạn chọn Yes.",
    ];
  if (url.endsWith("/reject"))
    return [
      "Từ chối lời mời?",
      "Lời mời sẽ được từ chối. Người gửi có thể gửi lại lời mời sau này.",
    ];
  if (url.endsWith("/cancel"))
    return [
      "Hủy lời mời đã gửi?",
      "Người nhận sẽ không còn thấy lời mời này. Bạn có thể gửi lời mời mới sau đó.",
    ];
  if (url.endsWith("/conversations"))
    return [
      "Mở cuộc trò chuyện?",
      `Mở chat với ${name}? Nếu đã có chat, lịch sử cũ sẽ được dùng lại.`,
    ];
  return ["Xác nhận thao tác?", "Chọn Yes để tiếp tục hoặc No để giữ nguyên."];
}
async function api(url, body) {
  if (
    body !== undefined &&
    /\/friendships\/(block|remove)$/.test(url) &&
    !(await confirmAction(...confirmationFor(url, body)))
  )
    throw new CancelledAction();
  const response = await fetch(
    url,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && ready) clearSession();
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  return data;
}
function paragraph(parent, text, className) {
  const p = document.createElement("p");
  p.textContent = text;
  if (className) p.className = className;
  parent.append(p);
  return p;
}
function button(parent, label, work, action, danger = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  if (action) b.dataset.action = action;
  if (danger) b.classList.add("danger");
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await work(b);
    } catch (error) {
      report(error);
    } finally {
      b.disabled = b.dataset.completed === "true";
    }
  });
  parent.append(b);
  return b;
}
function row(parent, title, detail) {
  const item = document.createElement("div");
  item.className = "list-row";
  const info = document.createElement("div");
  info.className = "list-info";
  item.dataset.initials = Array.from(title || "?")
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("vi-VN");
  item.dataset.color = String((title || "").codePointAt(0) % 5);
  paragraph(info, title, "list-title");
  if (detail) paragraph(info, detail, "list-detail");
  const actions = document.createElement("div");
  actions.className = "row-actions";
  item.append(info, actions);
  parent.append(item);
  return actions;
}
function empty(parent, text) {
  if (!parent.children.length) paragraph(parent, text, "empty-state");
}
function clearSession() {
  if (el("confirmDialog").open) el("confirmDialog").close("no");
  el("chatWelcome").hidden = false;
  window.dispatchEvent(new Event("seruchat-clear"));
  lastListsSource = "";
  lastActionsSource = "";
  messageNodes.clear();
  ready = false;
  sessionPassword = null;
  keyPair = null;
  found = null;
  currentUserId.textContent = "";
  currentConversationId = null;
  currentConversationUserId = null;
  currentFriendshipStatus = null;
  currentBlockedBy = null;
  viewVersion++;
  listVersion++;
  userCache.clear();
  plaintextCache.clear();
  historyRows.clear();
  historyCursor = null;
  for (const id of [
    "friendsList",
    "friendRequests",
    "outgoingRequests",
    "conversationsList",
    "messagesList",
    "blockedUsers",
    "chatActions",
    "foundExtraActions",
  ])
    el(id).replaceChildren();
  document.body.classList.remove("signed-in");
  el("userInfo").hidden = true;
  el("chatSection").hidden = true;
  el("foundUser").hidden = true;
  el("loginSection").hidden = false;
  el("registerSection").hidden = true;
  el("loginForm").reset();
  el("messageInput").value = "";
  notice("");
}
async function showUser(user, password) {
  const token = ++viewVersion;
  el("username").textContent = user.username;
  el("userEmail").textContent = user.email;
  currentUserId.textContent = user.id;
  userCache.set(user.id, user.username);
  try {
    const keys = await openChatRecovery(user, password);
    if (token !== viewVersion || currentUserId.textContent !== user.id) return;
    keyPair = keys;
    ready = true;
    el("loginSection").hidden = true;
    el("registerSection").hidden = true;
    el("userInfo").hidden = false;
    document.body.classList.add("signed-in");
    await refreshLists();
    window.dispatchEvent(new Event("seruchat-ready"));
  } finally {
    sessionPassword = null;
    el("loginForm").reset();
  }
}
async function relationshipAction(action, userId) {
  const data = await api(`/api/friendships/${action}`, {
    targetUserId: userId,
  });
  notice(data.message);
  await refreshLists();
}
async function decideRequest(id, action) {
  const data = await api(`/api/friendships/${id}/${action}`, {});
  notice(data.message);
  await refreshLists();
}
async function chatWith(userId) {
  if (openingChat) return;
  openingChat = true;
  updateSendState();
  try {
    const data = await api("/api/conversations", { friendId: userId });
    await refreshLists();
    await openConversation(data.conversationId, userId, "accepted");
  } finally {
    openingChat = false;
    updateSendState();
  }
}
const statusLabels = {
  accepted: "Bạn bè",
  pending: "Đang chờ kết bạn",
  rejected: "Đã từ chối",
  blocked: "Đã chặn",
};
function renderFound() {
  if (!found) return;
  const user = found.user,
    relation = found.relationship,
    mine = currentUserId.textContent;
  const self = user.id === mine,
    blocked = relation?.status === "blocked";
  el("foundUsername").textContent = user.username;
  el("foundUserId").textContent = user.id;
  el("foundRelationship").textContent = self
    ? "Đây là tài khoản của bạn."
    : blocked
      ? relation.blocked_by === mine
        ? "Bạn đang chặn người này."
        : "Người này đang chặn bạn."
      : statusLabels[relation?.status] || "Chưa kết bạn";
  el("addFriend").hidden =
    self || ["accepted", "pending", "blocked"].includes(relation?.status);
  el("blockFoundUser").hidden = self || blocked;
  const actions = el("foundExtraActions");
  actions.replaceChildren();
  if (relation?.status === "accepted") {
    button(actions, "Mở chat", () => chatWith(user.id), "open-chat");
    button(
      actions,
      "Xóa bạn",
      () => relationshipAction("remove", user.id),
      "remove",
      true,
    );
  } else if (blocked && relation.blocked_by === mine)
    button(
      actions,
      "Bỏ chặn",
      () => relationshipAction("unblock", user.id),
      "unblock",
    );
  else if (relation?.status === "pending") {
    if (relation.requested_by === mine)
      button(
        actions,
        "Hủy lời mời",
        () => decideRequest(relation.id, "cancel"),
        "cancel",
      );
    else {
      button(
        actions,
        "Chấp nhận",
        () => decideRequest(relation.id, "accept"),
        "accept",
      );
      button(
        actions,
        "Từ chối",
        () => decideRequest(relation.id, "reject"),
        "reject",
      );
    }
  }
}
async function refreshLists() {
  if (!ready) return;
  const id = currentUserId.textContent,
    version = ++listVersion,
    foundId = found?.user.id;
  const [incoming, outgoing, friends, conversations, blocked, foundResult] =
    await Promise.all([
      api("/api/friendships/requests"),
      api("/api/friendships/outgoing"),
      api("/api/friendships"),
      api("/api/conversations"),
      api("/api/friendships/blocked"),
      foundId ? api(`/api/users/${foundId}`) : null,
    ]);
  if (!ready || id !== currentUserId.textContent || version !== listVersion)
    return;
  const source = JSON.stringify([
    incoming,
    outgoing,
    friends,
    conversations,
    blocked,
    foundResult,
  ]);
  if (source === lastListsSource) return;
  lastListsSource = source;
  for (const request of [...incoming.requests, ...outgoing.requests])
    userCache.set(request.user_id, request.username);
  el("friendRequests").replaceChildren();
  for (const request of incoming.requests) {
    const actions = row(
      el("friendRequests"),
      request.username,
      "Muốn kết bạn với bạn",
    );
    button(
      actions,
      "Chấp nhận",
      () => decideRequest(request.id, "accept"),
      "accept",
    );
    button(
      actions,
      "Từ chối",
      () => decideRequest(request.id, "reject"),
      "reject",
    );
    button(
      actions,
      "Chặn",
      () => relationshipAction("block", request.user_id),
      "block",
      true,
    );
  }
  empty(el("friendRequests"), "Không có lời mời mới.");
  el("outgoingRequests").replaceChildren();
  for (const request of outgoing.requests) {
    const actions = row(
      el("outgoingRequests"),
      request.username,
      "Đang chờ người nhận chấp nhận",
    );
    button(
      actions,
      "Hủy lời mời",
      () => decideRequest(request.id, "cancel"),
      "cancel",
    );
  }
  empty(el("outgoingRequests"), "Chưa có lời mời đang chờ.");
  el("friendsList").replaceChildren();
  for (const friend of friends.friends) {
    userCache.set(friend.id, friend.username);
    const actions = row(el("friendsList"), friend.username, "Bạn bè");
    button(actions, "Mở chat", () => chatWith(friend.id), "open-chat");
    button(
      actions,
      "Xóa bạn",
      () => relationshipAction("remove", friend.id),
      "remove",
      true,
    );
    button(
      actions,
      "Chặn",
      () => relationshipAction("block", friend.id),
      "block",
      true,
    );
  }
  empty(el("friendsList"), "Chưa có bạn. Tìm tên người dùng để gửi lời mời.");
  el("conversationsList").replaceChildren();
  for (const conversation of conversations) {
    userCache.set(conversation.user_id, conversation.username);
    const actions = row(
      el("conversationsList"),
      conversation.username,
      statusLabels[conversation.friendship_status] ||
        "Chưa kết bạn • lịch sử được giữ",
    );
    button(
      actions,
      "Mở chat",
      () =>
        openConversation(
          conversation.conversation_id,
          conversation.user_id,
          conversation.friendship_status,
          conversation.blocked_by,
        ),
      "open-chat",
    );
    if (currentConversationId === conversation.conversation_id) {
      currentFriendshipStatus = conversation.friendship_status;
      currentBlockedBy = conversation.blocked_by;
    }
  }
  empty(el("conversationsList"), "Chưa có cuộc trò chuyện.");
  el("blockedUsers").replaceChildren();
  for (const user of blocked.users) {
    userCache.set(user.id, user.username);
    const actions = row(
      el("blockedUsers"),
      user.username,
      "" +
        (user.blocked_previous_status === "accepted"
          ? "Bỏ chặn để khôi phục bạn bè"
          : "Bỏ chặn để có thể gửi lời mời mới"),
    );
    button(
      actions,
      "Bỏ chặn",
      () => relationshipAction("unblock", user.id),
      "unblock",
    );
  }
  empty(el("blockedUsers"), "Bạn chưa chặn ai.");
  if (foundResult && found?.user.id === foundId) {
    found = foundResult;
    renderFound();
  }
  updateSendState();
  window.dispatchEvent(new Event("seruchat-lists"));
}
function updateSendState() {
  const accepted = currentFriendshipStatus === "accepted";
  el("directFile").disabled = openingChat || !keyPair || !accepted;
  el("messageInput").disabled = openingChat || !keyPair || !accepted;
  el("sendMessageButton").disabled =
    openingChat || sending || !keyPair || !accepted;
  el("chatRelationship").textContent =
    currentFriendshipStatus === "blocked"
      ? currentBlockedBy === currentUserId.textContent
        ? "Bạn đã chặn người này. Bỏ chặn để tiếp tục; lịch sử vẫn đọc được."
        : "Người này đang chặn bạn. Chỉ họ có thể bỏ chặn; lịch sử vẫn đọc được."
      : !accepted && currentConversationId
        ? "Hai bên chưa là bạn. Cần lời mời được chấp nhận để gửi tin mới; lịch sử vẫn còn."
        : "";
  const source = JSON.stringify([
    currentConversationUserId,
    currentFriendshipStatus,
    currentBlockedBy,
  ]);
  if (source === lastActionsSource) return;
  lastActionsSource = source;
  const actions = el("chatActions");
  actions.replaceChildren();
  if (!currentConversationUserId) return;
  const peer = currentConversationUserId;
  if (accepted) {
    button(
      actions,
      "Xóa bạn",
      () => relationshipAction("remove", peer),
      "remove",
      true,
    );
    button(
      actions,
      "Chặn",
      () => relationshipAction("block", peer),
      "block",
      true,
    );
  } else if (
    currentFriendshipStatus === "blocked" &&
    currentBlockedBy === currentUserId.textContent
  )
    button(
      actions,
      "Bỏ chặn",
      () => relationshipAction("unblock", peer),
      "unblock",
    );
  else if (!currentFriendshipStatus || currentFriendshipStatus === "rejected")
    button(
      actions,
      "Kết bạn lại",
      () => relationshipAction("request", peer),
      "request",
    );
}
async function openConversation(id, peer, status, blockedBy = null) {
  const navigation = ++viewVersion;
  window.dispatchEvent(
    new CustomEvent("seruchat-direct-open", { detail: { id } }),
  );
  messageNodes.clear();
  plaintextCache.clear();
  historyRows.clear();
  historyCursor = null;
  el("loadOlder").hidden = true;
  el("messageSearch").value = "";
  el("chatWelcome").hidden = true;
  document.querySelector(".workspace").classList.add("chat-open");
  currentConversationId = id;
  currentConversationUserId = peer;
  currentFriendshipStatus = status;
  currentBlockedBy = blockedBy;
  el("chatSection").hidden = false;
  el("chatUser").textContent = userCache.get(peer) || "Cuộc trò chuyện";
  el("messagesList").replaceChildren();
  el("messageInput").value = "";
  el("messageStatus").textContent = "";
  updateSendState();
  await refreshMessages();
  if (navigation !== viewVersion) return;
  window.dispatchEvent(
    new CustomEvent("seruchat-room", { detail: { scope: "direct", id } }),
  );
}
async function refreshMessages(older = false) {
  if (!ready || !currentConversationId) return;
  const version = viewVersion,
    myId = currentUserId.textContent;
  if (older && !historyCursor) return;
  const page = await api(
    `/api/history/${currentConversationId}${older ? "?before=" + encodeURIComponent(historyCursor) : ""}`,
  );
  if (!ready || version !== viewVersion || myId !== currentUserId.textContent)
    return;
  if (older || !historyRows.size) historyCursor = page.next;
  for (const message of page.messages) historyRows.set(message.id, message);
  // Merge bounded HTTP pages; plaintext cache itself is capped at 1000 entries.
  const messages = [...historyRows.values()].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  el("loadOlder").hidden = !historyCursor;
  const list = el("messagesList"),
    nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60,
    oldHeight = list.scrollHeight,
    oldScroll = list.scrollTop;
  let changed = false;
  for (const message of messages) {
    const source = JSON.stringify(message),
      cached = messageNodes.get(message.id);
    if (cached?.source === source) continue;
    const item = document.createElement("div");
    item.className = "chat-message";
    item.dataset.created = message.created_at;
    item.dataset.messageId = message.id;
    if (message.sender_id === myId) item.classList.add("mine");
    paragraph(
      item,
      userCache.get(message.sender_id) || message.sender_id,
      "message-sender",
    );
    let text = "Khóa đang bị khóa. Đăng nhập lại để đọc tin.";
    if (keyPair) {
      try {
        text = await plaintextCache.resolve(message, (row) =>
          row.sender_id === myId
            ? decryptOwnMessage(row, keyPair.privateKey)
            : decryptMessage(row, keyPair.privateKey),
        );
      } catch {
        text = "[Không thể giải mã tin nhắn này]";
      }
    }
    paragraph(item, text, "message-text");
    item.dataset.legacy = "true";
    item.dataset.sender = message.sender_id;
    item.title = "Tin từ phiên bản cũ: chưa có chữ ký xác thực người gửi.";
    const time = document.createElement("time");
    time.dateTime = message.created_at;
    time.textContent = new Date(message.created_at).toLocaleTimeString(
      "vi-VN",
      { hour: "2-digit", minute: "2-digit" },
    );
    time.title = new Date(message.created_at).toLocaleString("vi-VN");
    item.append(time);
    if (!ready || version !== viewVersion || myId !== currentUserId.textContent)
      return;
    list.querySelector(".empty-state")?.remove();
    if (cached?.node.isConnected) cached.node.replaceWith(item);
    else {
      const next = [...list.querySelectorAll(".chat-message")].find(
        (n) =>
          (n.dataset.created || "").localeCompare(message.created_at) > 0 ||
          ((n.dataset.created || "") === message.created_at &&
            (n.dataset.messageId || "").localeCompare(message.id) > 0),
      );
      list.insertBefore(item, next || null);
    }
    messageNodes.set(message.id, { source, node: item });
    changed = true;
  }
  if (!ready || version !== viewVersion || myId !== currentUserId.textContent)
    return;
  if (!list.children.length) empty(list, "Chưa có tin nhắn. Gửi lời chào nhé!");
  if (changed) {
    if (older) list.scrollTop = oldScroll + list.scrollHeight - oldHeight;
    else if (nearBottom) list.scrollTop = list.scrollHeight;
  }
  window.dispatchEvent(new Event("seruchat-messages"));
}
el("loadOlder").addEventListener("click", async () => {
  if (loadingOlder) return;
  loadingOlder = true;
  el("loadOlder").disabled = true;
  try {
    await refreshMessages(true);
  } catch (error) {
    report(error);
  } finally {
    loadingOlder = false;
    el("loadOlder").disabled = false;
  }
});
el("showRegister").addEventListener("click", () => {
  el("loginSection").hidden = true;
  el("registerSection").hidden = false;
});
el("showLogin").addEventListener("click", () => {
  el("registerSection").hidden = true;
  el("loginSection").hidden = false;
});
el("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = el("registerForm").querySelector("button[type=submit]");
  if (submit.disabled) return;
  const password = el("registerPassword").value;
  if (password !== el("confirmPassword").value) {
    el("registerMessage").textContent = "Hai mật khẩu chưa khớp.";
    return;
  }
  submit.disabled = true;
  try {
    await api("/api/auth/register", {
      displayName: el("registerUsername").value,
      handle: el("registerHandle").value,
      dateOfBirth: el("registerBirth").value,
      phone: el("registerPhone").value,
      acceptTerms: el("registerTerms").checked,
      email: el("registerEmail").value,
      password,
    });
    el("registerForm").reset();
    el("registerSection").hidden = true;
    el("loginSection").hidden = false;
    el("loginMessage").textContent =
      "Đã tạo tài khoản. Đăng nhập để thiết lập PIN bảo vệ lịch sử.";
  } catch (error) {
    report(error, "registerMessage");
  } finally {
    submit.disabled = false;
  }
});
el("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = el("loginForm").querySelector("button[type=submit]");
  if (submit.disabled) return;
  submit.disabled = true;
  try {
    const password = el("loginPassword").value,
      data = await api("/api/auth/login", {
        email: el("loginEmail").value,
        password,
      });
    await showUser(data.user, password);
    el("loginMessage").textContent = "";
    notice("");
  } catch (error) {
    report(error, "loginMessage");
  } finally {
    submit.disabled = false;
  }
});
el("logout").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", {});
    clearSession();
    el("loginMessage").textContent = "Bạn đã đăng xuất.";
  } catch (error) {
    report(error, "logoutMessage");
  }
});
el("findUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    found = await api(
      `/api/users/${encodeURIComponent(el("userId").value.trim())}`,
    );
    userCache.set(found.user.id, found.user.username);
    renderFound();
    el("foundUser").hidden = false;
    el("findUserMessage").textContent = "";
  } catch (error) {
    found = null;
    el("foundUser").hidden = true;
    report(error, "findUserMessage");
  }
});
el("addFriend").addEventListener("click", async () => {
  try {
    if (found) await relationshipAction("request", found.user.id);
  } catch (error) {
    report(error);
  }
});
el("blockFoundUser").addEventListener("click", async () => {
  try {
    if (found) await relationshipAction("block", found.user.id);
  } catch (error) {
    report(error);
  }
});
el("copyUserId").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentUserId.textContent);
    el("copyMessage").textContent = "User ID copied";
  } catch {
    el("copyMessage").textContent = "Select and copy your User ID manually.";
  }
});
el("messageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sending) return;
  const message = el("messageInput").value.trim();
  if (
    !message ||
    !currentConversationId ||
    !keyPair ||
    currentFriendshipStatus !== "accepted"
  )
    return;
  if (new TextEncoder().encode(message).length > 8192) {
    el("messageStatus").textContent =
      "Tin nhắn quá dài. Vui lòng rút ngắn nội dung.";
    return;
  }
  sending = true;
  updateSendState();
  const version = viewVersion,
    conversation = currentConversationId,
    peer = currentConversationUserId;
  try {
    if (!ready || version !== viewVersion) return;
    await window.SeruchatChat.sendDirect(
      conversation,
      window.ThreadActions?.compose("direct", conversation, message) || message,
    );
    window.ThreadActions?.sent("direct", conversation);
    if (window.ThreadActions?.drafts.get("direct:" + conversation) === message)
      window.ThreadActions.drafts.delete("direct:" + conversation);
    if (version === viewVersion) {
      if (el("messageInput").value.trim() === message)
        el("messageInput").value = "";
      el("messageStatus").textContent = "Đã gửi tin.";
      await refreshMessages();
    }
  } catch (error) {
    report(error, "messageStatus");
  } finally {
    sending = false;
    updateSendState();
  }
});
el("messageInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    el("messageForm").requestSubmit();
  }
});
setInterval(async () => {
  if (!ready || refreshing || document.hidden || el("confirmDialog").open)
    return;
  refreshing = true;
  try {
    await refreshLists();
    await refreshMessages();
  } catch (error) {
    if (ready) report(error, "messageStatus");
  } finally {
    refreshing = false;
  }
}, 2500);
(async () => {
  try {
    const data = await api("/api/auth/me");
    await showUser(data.user);
  } catch (error) {
    el("loginMessage").textContent = [
      "Not authenticated",
      "Bạn chưa đăng nhập.",
    ].includes(error.message)
      ? ""
      : error.message;
  }
})();
