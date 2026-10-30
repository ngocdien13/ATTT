"use strict";
(() => {
  const prefix = "SCUI1:",
    records = new Map(),
    drafts = new Map();
  let mode = null;
  const key = (scope, id) => scope + ":" + id;
  function parse(text) {
    if (!text?.startsWith(prefix)) return null;
    try {
      const o = JSON.parse(text.slice(prefix.length));
      if (
        o.v !== 1 ||
        !["message", "edit", "delete", "react", "pin", "unpin"].includes(o.op)
      )
        return null;
      if (["message", "edit"].includes(o.op) && typeof o.text !== "string")
        return null;
      if (o.op !== "message" && !/^[0-9a-f-]{36}$/i.test(o.target || ""))
        return null;
      if (o.reply && !/^[0-9a-f-]{36}$/i.test(o.reply)) return null;
      return o;
    } catch {
      return null;
    }
  }
  function remember(node, message, context) {
    if (node.dataset.verified !== "true") return;
    const text = node.querySelector(".message-text")?.textContent || "",
      payload = parse(text);
    node.dataset.scope = context.scope;
    node.dataset.thread = context.id;
    records.set(key(context.scope, context.id) + ":" + message.id, {
      node,
      message,
      context,
      original: text,
      payload,
    });
    while (records.size > 2000) records.delete(records.keys().next().value);
    node.tabIndex = 0;
  }
  function project(list) {
    const nodes = [
      ...list.querySelectorAll(".chat-message[data-verified=true]"),
    ];
    const room = nodes[0];
    if (!room) return;
    const root = key(room.dataset.scope, room.dataset.thread) + ":";
    const entries = [...records]
      .filter(([k]) => k.startsWith(root))
      .map(([, r]) => r)
      .filter((r) => r.node.isConnected)
      .sort(
        (a, b) =>
          a.message.created_at.localeCompare(b.message.created_at) ||
          a.message.id.localeCompare(b.message.id),
      );
    const states = new Map();
    for (const r of entries) {
      const p = r.payload;
      if (p && p.op !== "message") {
        r.node.classList.add("action-event");
        continue;
      }
      r.node.classList.remove("action-event");
      states.set(r.message.id, {
        record: r,
        text: p?.text ?? r.original,
        reply: p?.reply || null,
        deleted: false,
        reactions: new Map(),
        pinned: false,
        edited: false,
      });
    }
    for (const r of entries) {
      const a = r.payload;
      if (!a || a.op === "message" || typeof a.target !== "string") continue;
      const target = states.get(a.target);
      if (!target) continue;
      const actor = r.message.envelope.header.senderId,
        owner = target.record.message.envelope.header.senderId;
      if (
        a.op === "edit" &&
        target.record.message.envelope.header.type === "text" &&
        actor === owner &&
        typeof a.text === "string" &&
        a.text.length <= 8192 &&
        !target.deleted
      ) {
        target.text = a.text;
        target.edited = true;
      }
      if (a.op === "delete" && actor === owner) {
        target.deleted = true;
        target.text = "Tin nhắn đã được thu hồi";
      }
      if (
        a.op === "react" &&
        ["👍", "❤️", "😂", "😮", "😢", "🙏", ""].includes(a.emoji)
      ) {
        if (a.emoji) target.reactions.set(actor, a.emoji);
        else target.reactions.delete(actor);
      }
      if (
        ["pin", "unpin"].includes(a.op) &&
        (r.context.scope === "direct" ||
          ["owner", "admin"].includes(
            r.context.members.find((m) => m.id === actor)?.role,
          ))
      )
        target.pinned = a.op === "pin";
    }
    let pinned = null;
    for (const st of states.values()) {
      const node = st.record.node,
        text = node.querySelector(".message-text");
      if (text.textContent !== st.text) text.textContent = st.text;
      node.classList.toggle("recalled", st.deleted);
      node.dataset.recalled = String(st.deleted);
      node.dataset.pinned = String(st.pinned && !st.deleted);
      for (const child of node.querySelectorAll(
        ".download-file,.preview-file,.file-status,.file-preview,.list-detail,canvas,img",
      ))
        child.hidden = st.deleted;
      node.dataset.edited = String(st.edited);
      let extra = node.querySelector(".message-extra");
      const pieces = [];
      if (st.reply) {
        const ref = states.get(st.reply);
        pieces.push("↩ " + (ref ? ref.text.slice(0, 70) : "Tin nhắn trước đó"));
      }
      if (st.edited && !st.deleted) pieces.push("đã sửa");
      const counts = {};
      for (const e of st.reactions.values()) counts[e] = (counts[e] || 0) + 1;
      for (const [e, n] of Object.entries(counts)) pieces.push(e + " " + n);
      if (st.pinned && !st.deleted) {
        pieces.push("📌");
        pinned = { id: st.record.message.id, text: st.text };
      }
      const value = st.deleted ? "" : pieces.join(" · ");
      if (value) {
        if (!extra) {
          extra = document.createElement("p");
          extra.className = "message-extra";
          node.append(extra);
        }
        if (extra.textContent !== value) extra.textContent = value;
      } else extra?.remove();
    }
    window.dispatchEvent(
      new CustomEvent("seruchat-pinned", {
        detail: { scope: room.dataset.scope, id: room.dataset.thread, pinned },
      }),
    );
  }
  async function event(op, target, extra = {}) {
    await window.SeruchatChat.sendEvent(
      target.scope,
      target.id,
      prefix + JSON.stringify({ v: 1, op, target: target.messageId, ...extra }),
    );
  }
  function compose(scope, id, text) {
    if (mode && mode.scope === scope && mode.id === id) {
      const state = mode;
      return (
        prefix +
        JSON.stringify({
          v: 1,
          op: state.op === "edit" ? "edit" : "message",
          ...(state.op === "edit"
            ? { target: state.messageId }
            : { reply: state.messageId }),
          text,
        })
      );
    }
    return text.startsWith(prefix)
      ? prefix + JSON.stringify({ v: 1, op: "message", text })
      : text;
  }
  function select(op, target, text) {
    mode = { ...target, op };
    window.dispatchEvent(
      new CustomEvent("seruchat-composer", { detail: { ...mode, text } }),
    );
  }
  window.ThreadActions = {
    remember,
    project,
    event,
    compose,
    select,
    sent(scope, id) {
      if (mode && (mode.scope !== scope || mode.id !== id)) return;
      mode = null;
      window.dispatchEvent(
        new CustomEvent("seruchat-composer", { detail: null }),
      );
    },
    cancel() {
      mode = null;
      window.dispatchEvent(
        new CustomEvent("seruchat-composer", { detail: null }),
      );
    },
    preview(text) {
      const p = parse(text);
      return !p
        ? text
        : p.op === "message"
          ? p.text
          : {
              edit: "✎ Tin nhắn đã sửa",
              delete: "Tin nhắn đã thu hồi",
              react: "Bày tỏ cảm xúc",
              pin: "📌 Đã ghim tin",
              unpin: "Đã bỏ ghim tin",
            }[p.op] || "";
    },
    drafts,
  };
  window.addEventListener("seruchat-clear", () => {
    records.clear();
    drafts.clear();
    mode = null;
  });
})();
