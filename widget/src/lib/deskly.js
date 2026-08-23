export const DESKLY = "http://localhost:8099/api/v2";

export async function loadArticles(fallbackUrl) {
  try {
    const r = await fetch(DESKLY + "/help_center/articles");
    if (!r.ok) throw 0;
    return { articles: (await r.json()).articles || [], desklyUp: true };
  } catch (e) { /* fall through */ }
  try {
    const r = await fetch(fallbackUrl);
    return { articles: (await r.json()).articles || [], desklyUp: false };
  } catch (err) {
    return { articles: [], desklyUp: false };
  }
}

export async function postTicket(payload) {
  const res = await fetch(DESKLY + "/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("ticket " + res.status);
  return (await res.json()).ticket;
}

export async function fetchComments(ticketId) {
  const r = await fetch(DESKLY + "/tickets/" + ticketId + "/comments");
  if (!r.ok) return null;
  return (await r.json()).comments || [];
}

export async function postComment(ticketId, text) {
  await fetch(DESKLY + "/tickets/" + ticketId + "/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment: { body: text, author: "customer" } }),
  });
}

export async function solveTicket(ticketId) {
  await fetch(DESKLY + "/tickets/" + ticketId + "/solve", { method: "POST" });
}

export async function llmStatus() {
  try {
    const r = await fetch(DESKLY + "/sirius/status");
    if (!r.ok) return { configured: false };
    return await r.json();
  } catch (e) {
    return { configured: false };
  }
}

export async function askSirius({ message, customer, history, situation }) {
  const r = await fetch(DESKLY + "/sirius/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, customer, history, situation }),
  });
  if (r.status === 503) return { configured: false };
  if (!r.ok) throw new Error("llm " + r.status);
  const data = await r.json();
  return { configured: true, ...data };
}
