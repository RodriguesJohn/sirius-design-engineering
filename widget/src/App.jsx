import { useCallback, useEffect, useRef, useState } from "react";
import Bubble from "./components/Bubble.jsx";
import Composer from "./components/Composer.jsx";
import Header from "./components/Header.jsx";
import Messages from "./components/Messages.jsx";
import { ANGER, answerPolicy, bestArticle, classify, greeting, shouldEscalate, ticketPayload } from "./lib/brain.js";
import { connectPrompt, mustActNow, situation, spokenContext, starterPrompts } from "./lib/conversation.js";
import { compactCustomer, fullName } from "./lib/customer.js";
import { askSirius, fetchComments, loadArticles, postComment, postTicket, solveTicket } from "./lib/deskly.js";
import { loadStats, saveStats } from "./lib/stats.js";

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const FILE_OK = /\.(png|jpe?g|gif|webp|heic|heif|pdf|docx?|txt|csv|rtf)$/i;

function fileKind(file) {
  const name = file && file.name ? file.name : "";
  const type = file && file.type ? file.type : "";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(name)) return "image";
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (/word|officedocument/.test(type) || /\.docx?$/i.test(name)) return "doc";
  if (type.startsWith("text/") || /\.(txt|csv|rtf)$/i.test(name)) return "text";
  if (FILE_OK.test(name)) return "file";
  return null;
}

function prettySize(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

export default function App({ articlesUrl }) {
  const [customer, setCustomer] = useState(() => window.RITUAL_CUSTOMER);
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState(loadStats);

  const customerRef = useRef(customer);
  const articlesRef = useRef([]);
  const desklyUpRef = useRef(false);
  const ticketIdRef = useRef(null);
  const shownCommentsRef = useRef(0);
  const pendingHumanRef = useRef(false);
  const pendingSolveRef = useRef(false);
  const conversationRef = useRef([]);
  const pollTimerRef = useRef(null);
  const startedRef = useRef(false);
  const idRef = useRef(0);
  const inputRef = useRef(null);
  const escalateRef = useRef(null);

  customerRef.current = customer;

  const recordStat = useCallback((kind, reason) => {
    setStats((prev) => {
      const next = {
        resolved: prev.resolved + (kind === "resolved" ? 1 : 0),
        escalated: prev.escalated + (kind === "escalated" ? 1 : 0),
        reasons: [
          { kind, reason, at: new Date().toISOString(), who: fullName(customerRef.current) },
          ...prev.reasons,
        ].slice(0, 12),
      };
      saveStats(next);
      return next;
    });
  }, []);

  const add = useCallback((role, text, extra) => {
    const item = {
      id: ++idRef.current,
      kind: "msg",
      role,
      text,
      source: extra && extra.source,
      actions: extra && extra.actions,
      image: extra && extra.image,
      file: extra && extra.file,
    };
    setMessages((m) => [...m, item]);
    if (role === "user" || role === "bot" || role === "agent") {
      conversationRef.current.push({ role, text });
    }
    return item;
  }, []);

  const sys = useCallback((text) => {
    setMessages((m) => [...m, { id: ++idRef.current, kind: "sys", text }]);
  }, []);

  const startThread = useCallback(() => {
    setMessages([]);
    ticketIdRef.current = null;
    shownCommentsRef.current = 0;
    pendingHumanRef.current = false;
    pendingSolveRef.current = false;
    conversationRef.current = [];
    clearInterval(pollTimerRef.current);
    setWaiting(false);
    startedRef.current = true;
    add("bot", greeting(customerRef.current));
  }, [add]);

  const escalate = useCallback(async (query, intent, reason) => {
    const payload = ticketPayload(customerRef.current, conversationRef.current, query, intent, reason);
    try {
      const t = await postTicket(payload);
      ticketIdRef.current = t.id;
      shownCommentsRef.current = (t.comments || []).length;
      setWaiting(true);
      sys("Connected to the care team · ticket #" + t.id + " · " + payload.ticket.priority + " priority");
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(async () => {
        if (!ticketIdRef.current) return;
        try {
          const cs = await fetchComments(ticketIdRef.current);
          if (!cs) return;
          for (let i = shownCommentsRef.current; i < cs.length; i++) {
            if (cs[i].author === "agent") {
              add("agent", cs[i].body);
              setWaiting(false);
              if (!pendingSolveRef.current) {
                pendingSolveRef.current = true;
                add("bot", "If that clears it up, I can mark the ticket solved so it leaves the inbox.", {
                  actions: [
                    { id: "solve", label: "Mark it solved", primary: true },
                    { id: "still", label: "Still need help" },
                  ],
                });
              }
            }
          }
          shownCommentsRef.current = cs.length;
        } catch (e) { /* keep polling */ }
      }, 2000);
      recordStat("escalated", reason);
    } catch (err) {
      add("bot", "I tried to reach the care team and Deskly didn’t respond. Keep this window open and we’ll retry, or start Deskly with python3 deskly.py.");
    }
  }, [add, recordStat, sys]);

  escalateRef.current = escalate;

  const replyTo = useCallback(async (query) => {
    if (ticketIdRef.current) {
      try { await postComment(ticketIdRef.current, query); shownCommentsRef.current += 1; } catch (e) { /* shown locally */ }
      return;
    }
    if (pendingHumanRef.current) {
      pendingHumanRef.current = false;
      if (/^(yes|yeah|yep|please|ok|okay|sure|do it|connect|agent)/i.test(query.trim())) {
        setTyping(true);
        await wait(380);
        setTyping(false);
        await escalate(query, "human", "customer confirmed they want a person");
        return;
      }
    }

    setTyping(true);

    let llm = null;
    try {
      llm = await askSirius({
        message: query,
        customer: compactCustomer(customerRef.current),
        history: conversationRef.current.slice(-10),
        situation: situation(customerRef.current),
      });
    } catch (e) {
      llm = null;
    }

    if (llm && llm.configured && llm.reply) {
      const intent = llm.intent || classify(query);
      const hit = bestArticle(articlesRef.current, query);
      const gate = shouldEscalate(customerRef.current, intent, query, hit);
      const force = gate.yes && (mustActNow(customerRef.current, intent, query) || ANGER.test(query));
      setTyping(false);
      add("bot", llm.reply, llm.source ? { source: llm.source } : undefined);
      if (force || (llm.escalate && mustActNow(customerRef.current, intent, query))) {
        await escalate(query, intent, llm.reason || gate.reason || "model asked for a human");
        return;
      }
      if (llm.escalate || gate.yes || intent === "unknown") {
        pendingHumanRef.current = true;
        add("bot", connectPrompt(customerRef.current, intent, llm.reason || gate.reason || "not in the help center"), {
          actions: [{ id: "connect-gate", label: "Yes, connect me", primary: true, query, intent, reason: llm.reason || gate.reason || "not in the help center" }],
        });
        if (intent === "unknown") recordStat("unknown", query.slice(0, 80));
        return;
      }
      recordStat("resolved", intent);
      return;
    }

    await wait(400);

    const intent = classify(query);
    const hit = bestArticle(articlesRef.current, query);
    const gate = shouldEscalate(customerRef.current, intent, query, hit);

    setTyping(false);

    if (intent === "unknown" || (intent === "general" && !hit)) {
      add("bot", "That isn’t in our help center, and I won’t guess a policy we don’t have. I can connect you with someone on the team who can look it up.", {
        actions: [{ id: "connect-unknown", label: "Connect me", primary: true, query, reason: gate.reason || "not in the help center" }],
      });
      pendingHumanRef.current = true;
      recordStat("unknown", query.slice(0, 80));
      return;
    }

    if (gate.yes && (mustActNow(customerRef.current, intent, query) || ANGER.test(query))) {
      const spoken = spokenContext(customerRef.current, intent) || answerPolicy(customerRef.current, intent, query, hit);
      if (spoken && intent !== "human") add("bot", spoken.text, spoken.source ? { source: spoken.source } : undefined);
      else if (intent === "human") add("bot", connectPrompt(customerRef.current, intent, gate.reason));
      await escalate(query, intent, gate.reason);
      return;
    }

    const spoken = answerPolicy(customerRef.current, intent, query, hit);
    if (spoken) {
      add("bot", spoken.text, { source: spoken.source });
      if (!gate.yes) recordStat("resolved", intent);
      if (gate.yes) {
        pendingHumanRef.current = true;
        add("bot", connectPrompt(customerRef.current, intent, gate.reason), {
          actions: [{ id: "connect-gate", label: "Yes, connect me", primary: true, query, intent, reason: gate.reason }],
        });
      }
      return;
    }

    add("bot", "I don’t have a help-center article that answers that, so I won’t invent one.", {
      actions: [{ id: "connect-none", label: "Connect me", primary: true, query }],
    });
    pendingHumanRef.current = true;
  }, [add, escalate, recordStat]);

  async function handleAction(item, action) {
    if (action.id === "solve") {
      pendingSolveRef.current = false;
      try {
        await solveTicket(ticketIdRef.current);
        sys("Ticket #" + ticketIdRef.current + " marked solved");
        add("bot", "Done. Glad you’re sorted. I’m here if anything else comes up.");
        recordStat("resolved", "customer confirmed after agent reply");
      } catch (e) {
        add("bot", "I couldn’t mark it solved just now. The team can close it from Deskly.");
      }
      return;
    }
    if (action.id === "still") {
      pendingSolveRef.current = false;
      add("bot", "Okay. Tell them what still isn’t right. I’ll keep this thread open.");
      return;
    }
    if (action.id === "connect-unknown") {
      await escalate(action.query, "unknown", action.reason);
      return;
    }
    if (action.id === "connect-gate") {
      await escalate(action.query, action.intent, action.reason);
      return;
    }
    if (action.id === "connect-none") {
      await escalate(action.query, "unknown", "no grounded article");
    }
  }

  function setPanelOpen(next) {
    setOpen(next);
    if (next) {
      if (!startedRef.current) startThread();
      setTimeout(() => inputRef.current && inputRef.current.focus(), 80);
    }
  }

  async function sendQuery(raw) {
    const q = String(raw || "").trim();
    if (!q) return;
    setDraft("");
    add("user", q);
    await replyTo(q);
  }

  async function handleSend() {
    await sendQuery(draft);
  }

  async function handleAttach(file) {
    if (!file) return;
    const kind = fileKind(file);
    if (!kind) {
      sys("I can take photos or documents (pdf, Word, text). That file type isn’t supported.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      sys("That file is too large. Try one under 8 MB.");
      return;
    }

    const extra = {
      file: { name: file.name, kind, size: prettySize(file.size) },
    };
    if (kind === "image") {
      extra.image = await readAsDataUrl(file);
    }

    const note = "Attached a file: " + file.name;
    add("user", file.name, extra);

    if (ticketIdRef.current) {
      try {
        await postComment(ticketIdRef.current, note + ". File is in the customer chat. Review requested.");
        shownCommentsRef.current += 1;
      } catch (e) { /* shown locally */ }
      return;
    }

    await replyTo(note);
  }

  useEffect(() => {
    loadArticles(articlesUrl).then(({ articles, desklyUp }) => {
      articlesRef.current = articles;
      desklyUpRef.current = desklyUp;
    });
  }, [articlesUrl]);

  useEffect(() => {
    const onCustomer = (e) => {
      customerRef.current = e.detail;
      setCustomer(e.detail);
      if (open) startThread();
    };
    window.addEventListener("ritual:customer-changed", onCustomer);
    return () => window.removeEventListener("ritual:customer-changed", onCustomer);
  }, [open, startThread]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (open) setPanelOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => clearInterval(pollTimerRef.current), []);

  useEffect(() => {
    window.RitualCare = {
      stats: () => stats,
      open: () => setPanelOpen(true),
      escalate: (query, intent, reason) => escalateRef.current(query, intent, reason),
    };
  }, [stats]);

  return (
    <div id="rg-root">
      <Bubble open={open} waiting={waiting} onToggle={() => setPanelOpen(!open)} />
      <div id="rg-panel" className={open ? "open" : undefined} role="dialog" aria-labelledby="rg-brand" aria-modal="false">
        <Header onClose={() => setPanelOpen(false)} />
        <Messages items={messages} typing={typing} onAction={handleAction} />
        <Composer
          draft={draft}
          setDraft={setDraft}
          onSend={handleSend}
          onAttach={handleAttach}
          onPrompt={sendQuery}
          prompts={!waiting && !messages.some((m) => m.role === "user") ? starterPrompts(customer) : []}
          inputRef={inputRef}
        />
      </div>
    </div>
  );
}
