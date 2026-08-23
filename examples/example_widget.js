/* ============================================================================
   EXAMPLE WIDGET — the "walking skeleton"
   ----------------------------------------------------------------------------
   This is NOT the bar. It's the floor. It shows the full loop working:
     1. knows the logged-in customer (window.RITUAL_CUSTOMER)
     2. answers ONE kind of question from Deskly's help center articles
     3. escalates to a human via POST /tickets (with an AI-style summary)
     4. polls the ticket and shows the human agent's reply in this chat

   The "brain" here is dumb keyword matching. Your job is to replace it with
   an actual AI that reads the conversation, grounds answers in the articles,
   decides when to escalate, and writes a real handoff summary.
   ========================================================================== */

(function () {
  const DESKLY = "http://localhost:8099/api/v2";
  let customer = window.RITUAL_CUSTOMER;
  let ticketId = null;
  let pollTimer = null;
  let shownComments = 0;

  /* ---------- UI ---------- */
  const css = `
    #sp-bubble{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;
      background:#2d2a26;color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center;
      cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25);z-index:9999}
    #sp-panel{position:fixed;bottom:96px;right:24px;width:360px;height:520px;background:#fff;border-radius:16px;
      box-shadow:0 8px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;z-index:9999;
      font-family:Helvetica,Arial,sans-serif}
    #sp-head{background:#2d2a26;color:#fff;padding:14px 16px;font-size:15px}
    #sp-head small{display:block;color:#b8ae9c;font-size:11px;margin-top:2px}
    #sp-badge{position:absolute;top:12px;right:14px;font-size:9px;background:#8a7a5c;color:#fff;
      padding:2px 7px;border-radius:8px;letter-spacing:.06em}
    #sp-msgs{flex:1;overflow-y:auto;padding:14px;background:#faf7f2}
    .sp-m{margin:8px 0;padding:9px 13px;border-radius:12px;max-width:82%;font-size:13.5px;line-height:1.45;white-space:pre-wrap}
    .sp-bot{background:#fff;border:1px solid #e6ded2}
    .sp-user{background:#2d2a26;color:#fff;margin-left:auto}
    .sp-agent{background:#e6ffe9;border:1px solid #b7dcbb}
    .sp-sys{font-size:11px;color:#998f7e;text-align:center;margin:10px 0}
    .sp-src{font-size:10.5px;color:#8a7a5c;margin-top:6px;border-top:1px dashed #e6ded2;padding-top:4px}
    #sp-form{display:flex;gap:8px;padding:12px;border-top:1px solid #eee}
    #sp-in{flex:1;padding:10px 12px;border:1px solid #ccc;border-radius:10px;font:inherit;font-size:13.5px}
    #sp-send{border:none;background:#2d2a26;color:#fff;border-radius:10px;padding:0 16px;cursor:pointer}`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);

  const bubble = document.createElement("div"); bubble.id = "sp-bubble"; bubble.textContent = "💬";
  const panel = document.createElement("div"); panel.id = "sp-panel";
  panel.innerHTML = `
    <div id="sp-head" style="position:relative">Ritual Goods Support
      <small id="sp-who"></small><span id="sp-badge">DEMO SKELETON</span></div>
    <div id="sp-msgs"></div>
    <form id="sp-form"><input id="sp-in" placeholder="Ask us anything…" autocomplete="off">
      <button id="sp-send">➤</button></form>`;
  document.body.appendChild(bubble); document.body.appendChild(panel);

  const msgs = panel.querySelector("#sp-msgs");
  const input = panel.querySelector("#sp-in");

  function add(cls, text, src) {
    const d = document.createElement("div");
    d.className = "sp-m " + cls;
    d.textContent = text;
    if (src) { const s = document.createElement("div"); s.className = "sp-src"; s.textContent = "📄 source: " + src; d.appendChild(s); }
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
  }
  function sys(text) { const d = document.createElement("div"); d.className = "sp-sys"; d.textContent = text; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; }

  function greet() {
    msgs.innerHTML = ""; ticketId = null; shownComments = 0; clearInterval(pollTimer);
    const p = customer.profile;
    panel.querySelector("#sp-who").textContent = `chatting with ${p.first_name} ${p.last_name} (${p.customer_id})`;
    const last = customer.orders[customer.orders.length - 1];
    add("sp-bot", `Hi ${p.first_name}! 👋 How can I help today?` +
      (last ? `\n\n(I can see your latest order — ${last.product}, ${last.order_date}.)` : ""));
  }

  bubble.onclick = () => { panel.style.display = panel.style.display === "flex" ? "none" : "flex"; if (!msgs.children.length) greet(); };
  window.addEventListener("ritual:customer-changed", e => { customer = e.detail; if (panel.style.display === "flex") greet(); });

  /* ---------- the "brain" (replace all of this) ---------- */
  panel.querySelector("#sp-form").onsubmit = async (e) => {
    e.preventDefault();
    const q = input.value.trim(); if (!q) return;
    add("sp-user", q); input.value = "";

    // If a human ticket is open, everything goes to the ticket thread.
    if (ticketId) {
      await fetch(`${DESKLY}/tickets/${ticketId}/comments`, { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: { body: q, author: "customer" } }) });
      shownComments++; // our own message
      return;
    }

    const ql = q.toLowerCase();

    // (a) order lookup — uses the customer's real data
    if (ql.includes("where") && ql.includes("order") || ql.includes("my order") || ql.includes("last order")) {
      const last = customer.orders[customer.orders.length - 1];
      add("sp-bot", last
        ? `Your latest order is ${last.order_id} — ${last.product} ($${last.amount_usd}), placed ${last.order_date}. Tracking goes out by email the moment it ships.`
        : `I don't see any orders on your account yet.`);
      return;
    }

    // (b) policy answer — grounded in Deskly's help center
    // Dumb version: search articles, quote the top hit. Your AI should read
    // the article and actually answer the question — and refuse to invent
    // answers when no article covers it.
    if (/(return|refund|ship|deliver|cancel|subscri|retinol|melatonin|allerg|promo|code|restock|damaged)/.test(ql)) {
      const r = await fetch(`${DESKLY}/help_center/articles/search?query=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (d.results.length) {
        const a = d.results[0];
        add("sp-bot", `Here's what our ${a.title} policy says:\n\n“${a.body.slice(0, 260)}…”`, a.title);
        return;
      }
    }

    // (c) escalation — the round-trip
    if (/(human|agent|person|speak to someone|manager|angry|unacceptable|fed up|last chance)/.test(ql)) {
      return escalate(q);
    }

    // (d) fallback — the demo brain honestly gives up (your AI goes here)
    add("sp-bot", `🤖 Demo brain doesn't know this one — and it won't guess. This is where YOUR AI goes.\n\nWant me to get a human? Just say "agent".`);
  };

  async function escalate(lastMsg) {
    const p = customer.profile;
    const transcript = [...msgs.querySelectorAll(".sp-m")].map(d =>
      (d.classList.contains("sp-user") ? "customer: " : "bot: ") + d.firstChild.textContent).join("\n");
    const res = await fetch(`${DESKLY}/tickets`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: {
        subject: `Widget escalation — ${p.first_name} ${p.last_name}`,
        priority: parseFloat(p.lifetime_value_usd) > 400 ? "high" : "normal",
        tags: ["widget", "demo-skeleton"],
        requester: { name: `${p.first_name} ${p.last_name}`, customer_id: p.customer_id },
        ai_summary: `${p.first_name} (${p.customer_id}, $${p.lifetime_value_usd} LTV, ` +
          `${p.is_subscriber === "True" || p.is_subscriber === true ? "subscriber" : "non-subscriber"}) asked for a human. ` +
          `Last message: "${lastMsg}". [Your AI should write a real summary here: what happened, what they want, suggested action.]`,
        comment: { body: transcript, author: "customer" },
      }}) });
    const t = (await res.json()).ticket;
    ticketId = t.id; shownComments = t.comments.length;
    sys(`— connected to a human · ticket #${t.id} —`);
    add("sp-bot", `You're with our support team now, ${p.first_name}. A human agent has your full conversation and will reply right here.`);
    pollTimer = setInterval(poll, 2000);
  }

  async function poll() {
    if (!ticketId) return;
    const r = await fetch(`${DESKLY}/tickets/${ticketId}/comments`);
    const cs = (await r.json()).comments;
    for (let i = shownComments; i < cs.length; i++) {
      if (cs[i].author === "agent") add("sp-agent", `👩‍💼 Agent: ${cs[i].body}`);
    }
    shownComments = cs.length;
  }
})();
