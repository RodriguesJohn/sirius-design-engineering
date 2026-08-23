#!/usr/bin/env python3
"""
Deskly — the helpdesk Ritual Goods already uses. (A tiny Zendesk-style mock.)

Run:    python3 helpdesk/deskly.py    (from repo root; no dependencies, Python 3.8+)
Then:   http://localhost:8099        → the AGENT INBOX (what support agents see)
API:    http://localhost:8099/api/v2 → see API.md for endpoints

Your widget talks to this API. Human agents (the judges) use the inbox UI.
State is in-memory; restart = clean slate.
"""
import json, os, re, time, itertools
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import sirius_llm

PORT = 8099
_ticket_ids = itertools.count(1001)
TICKETS = {}   # id -> ticket dict (with "comments": [...])
HERE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(HERE, "articles.json")) as f:
    ARTICLES = json.load(f)["articles"]

INBOX_HTML = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Deskly — Agent Inbox</title>
<style>
 body{font-family:Helvetica,Arial,sans-serif;margin:0;background:#f4f5f7;color:#1f2430}
 header{background:#1f2430;color:#fff;padding:14px 24px;font-size:17px;letter-spacing:.03em}
 header b{color:#7ee0c2}
 .wrap{display:flex;height:calc(100vh - 49px)}
 .list{width:360px;overflow-y:auto;border-right:1px solid #dde;background:#fff}
 .tk{padding:14px 16px;border-bottom:1px solid #eef;cursor:pointer}
 .tk:hover{background:#f0f6ff}.tk.sel{background:#e6f0ff}
 .tk .subj{font-weight:bold;font-size:14px;margin-bottom:4px}
 .tk .meta{font-size:12px;color:#778}
 .pill{display:inline-block;font-size:10px;padding:2px 8px;border-radius:10px;margin-right:6px;text-transform:uppercase;letter-spacing:.05em}
 .p-urgent{background:#ffdddd;color:#a11}.p-high{background:#ffeacc;color:#a60}
 .p-normal{background:#e2ecff;color:#347}.p-low{background:#e8e8e8;color:#666}
 .s-new{background:#d9f7e8;color:#186a44}.s-open{background:#fff3c9;color:#8a6d00}.s-solved{background:#e8e8e8;color:#666}
 .detail{flex:1;overflow-y:auto;padding:24px 32px}
 .empty{color:#99a;margin-top:80px;text-align:center}
 .summary{background:#fffbe8;border:1px solid #eedc9a;border-radius:8px;padding:12px 16px;margin:12px 0;font-size:14px}
 .summary b{color:#8a6d00}
 .msg{margin:10px 0;padding:10px 14px;border-radius:10px;max-width:70%;font-size:14px;white-space:pre-wrap}
 .m-customer{background:#fff;border:1px solid #dde}
 .m-ai{background:#e9f5ff;border:1px solid #cde;margin-left:auto}
 .m-agent{background:#e6ffe9;border:1px solid #cec;margin-left:auto}
 .who{font-size:11px;color:#889;margin-bottom:2px}
 .reply{display:flex;gap:8px;margin-top:18px}
 .reply textarea{flex:1;padding:10px;border:1px solid #ccd;border-radius:8px;font:inherit;min-height:60px}
 .reply button{padding:0 22px;border:none;border-radius:8px;background:#1f6feb;color:#fff;font-size:14px;cursor:pointer}
 .tags{font-size:12px;color:#569;margin-top:4px}
</style></head><body>
<header>🌲 <b>Deskly</b> — Ritual Goods Agent Inbox <span id="count" style="float:right;font-size:13px"></span></header>
<div class="wrap">
 <div class="list" id="list"></div>
 <div class="detail" id="detail"><div class="empty">No ticket selected.<br><br>Tickets created via the API appear here instantly.</div></div>
</div>
<script>
let SEL=null, CACHE=[];
async function refresh(){
  const r=await fetch('/api/v2/tickets'); const d=await r.json(); CACHE=d.tickets;
  document.getElementById('count').textContent=d.tickets.length+' tickets';
  const L=document.getElementById('list'); L.innerHTML='';
  for(const t of d.tickets.slice().reverse()){
    const el=document.createElement('div'); el.className='tk'+(SEL===t.id?' sel':'');
    el.innerHTML=`<div class="subj">#${t.id} ${esc(t.subject)}</div>
      <div class="meta"><span class="pill p-${t.priority}">${t.priority}</span><span class="pill s-${t.status}">${t.status}</span>${esc(t.requester.name||'')} · ${t.comments.length} msgs</div>`;
    el.onclick=()=>{SEL=t.id;render();refresh();};
    L.appendChild(el);
  }
  if(SEL)render();
}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function render(){
  const t=CACHE.find(x=>x.id===SEL); if(!t)return;
  const D=document.getElementById('detail');
  const rb=document.getElementById('rb');
  const draft=rb?rb.value:'', hadFocus=rb&&document.activeElement===rb;
  let h=`<h2>#${t.id} ${esc(t.subject)}</h2>
    <div class="tags">requester: <b>${esc(t.requester.name||'?')}</b> (${esc(t.requester.customer_id||'no id')}) · tags: ${t.tags.map(esc).join(', ')||'—'}</div>`;
  if(t.ai_summary) h+=`<div class="summary"><b>🤖 AI HANDOFF SUMMARY</b><br>${esc(t.ai_summary)}</div>`;
  for(const c of t.comments) h+=`<div class="msg m-${esc(c.author)}"><div class="who">${esc(c.author)} · ${esc(c.created_at)}</div>${esc(c.body)}</div>`;
  h+=`<div class="reply"><textarea id="rb" placeholder="Reply as human agent… (this goes back to the customer's widget)"></textarea>
      <button onclick="send()">Send</button></div>`;
  D.innerHTML=h;
  const nrb=document.getElementById('rb');
  if(nrb){nrb.value=draft; if(hadFocus)nrb.focus();}
}
async function send(){
  const b=document.getElementById('rb').value.trim(); if(!b)return;
  await fetch(`/api/v2/tickets/${SEL}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({comment:{body:b,author:'agent'}})});
  refresh();
}
refresh(); setInterval(refresh, 2000);
</script></body></html>"""

def now(): return time.strftime("%Y-%m-%dT%H:%M:%S")

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[deskly] {self.command} {self.path}")

    def _send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(204, "")

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return None

    def do_GET(self):
        u = urlparse(self.path)
        if u.path in ("/", "/inbox"):
            return self._send(200, INBOX_HTML, "text/html")
        if u.path == "/api/v2/help_center/articles":
            return self._send(200, {"articles": ARTICLES, "count": len(ARTICLES)})
        if u.path == "/api/v2/help_center/articles/search":
            q = (parse_qs(u.query).get("query", [""])[0]).lower()
            words = [w for w in re.findall(r"[a-z0-9']+", q) if len(w) > 2]
            scored = []
            for a in ARTICLES:
                text = (a["title"] + " " + a["body"] + " " + " ".join(a["labels"])).lower()
                s = sum(text.count(w) for w in words)
                if s: scored.append((s, a))
            scored.sort(key=lambda x: -x[0])
            return self._send(200, {"results": [a for _, a in scored[:5]], "count": len(scored)})
        m = re.fullmatch(r"/api/v2/tickets/(\d+)", u.path)
        if m:
            t = TICKETS.get(int(m.group(1)))
            return self._send(200, {"ticket": t}) if t else self._send(404, {"error": "RecordNotFound"})
        m = re.fullmatch(r"/api/v2/tickets/(\d+)/comments", u.path)
        if m:
            t = TICKETS.get(int(m.group(1)))
            return self._send(200, {"comments": t["comments"]}) if t else self._send(404, {"error": "RecordNotFound"})
        if u.path == "/api/v2/tickets":
            return self._send(200, {"tickets": list(TICKETS.values()), "count": len(TICKETS)})
        if u.path == "/api/v2/sirius/status":
            return self._send(200, sirius_llm.configured())
        self._send(404, {"error": "no such endpoint — see API.md"})

    def do_POST(self):
        u = urlparse(self.path)
        body = self._body()
        if body is None:
            return self._send(400, {"error": "invalid JSON"})
        if u.path == "/api/v2/tickets":
            t = body.get("ticket", {})
            if not t.get("subject") or not t.get("comment", {}).get("body"):
                return self._send(422, {"error": "RecordInvalid",
                                        "details": "ticket.subject and ticket.comment.body are required"})
            tid = next(_ticket_ids)
            prio = t.get("priority", "normal")
            if prio not in ("low", "normal", "high", "urgent"): prio = "normal"
            ticket = {
                "id": tid, "subject": t["subject"], "status": "new", "priority": prio,
                "tags": t.get("tags", []), "requester": t.get("requester", {}),
                "ai_summary": t.get("ai_summary", ""),
                "created_at": now(),
                "comments": [{"author": t.get("comment", {}).get("author", "customer"),
                              "body": t["comment"]["body"], "created_at": now()}],
            }
            TICKETS[tid] = ticket
            print(f"[deskly] 🎫 ticket #{tid} created: {ticket['subject']!r} (prio={prio})")
            return self._send(201, {"ticket": ticket})
        m = re.fullmatch(r"/api/v2/tickets/(\d+)/comments", u.path)
        if m:
            t = TICKETS.get(int(m.group(1)))
            if not t: return self._send(404, {"error": "RecordNotFound"})
            c = body.get("comment", {})
            if not c.get("body"):
                return self._send(422, {"error": "RecordInvalid", "details": "comment.body required"})
            author = c.get("author", "customer")
            if author not in ("customer", "agent", "ai"): author = "customer"
            comment = {"author": author, "body": c["body"], "created_at": now()}
            t["comments"].append(comment)
            if author == "agent" and t["status"] == "new": t["status"] = "open"
            return self._send(201, {"comment": comment})
        m = re.fullmatch(r"/api/v2/tickets/(\d+)/solve", u.path)
        if m:
            t = TICKETS.get(int(m.group(1)))
            if not t: return self._send(404, {"error": "RecordNotFound"})
            t["status"] = "solved"
            return self._send(200, {"ticket": t})
        if u.path == "/api/v2/sirius/reply":
            if not (body.get("message") or "").strip():
                return self._send(422, {"error": "message required"})
            payload = dict(body)
            payload.setdefault("articles", ARTICLES)
            result, err = sirius_llm.complete(payload)
            if err == "missing_key":
                return self._send(503, {"error": "missing_key", "configured": False})
            if err:
                return self._send(502, {"error": err})
            return self._send(200, result)
        self._send(404, {"error": "no such endpoint — see API.md"})

if __name__ == "__main__":
    llm = sirius_llm.configured()
    llm_note = f"on ({llm['model']})" if llm["configured"] else "off — drop OPENAI_API_KEY in .env"
    print(f"🌲 Deskly running → agent inbox: http://localhost:{PORT}   api: http://localhost:{PORT}/api/v2")
    print(f"   Sirius LLM: {llm_note}")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
