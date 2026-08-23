# Deskly API Reference

Deskly is the helpdesk Ritual Goods already runs. Start it with `python3 deskly.py`
(no dependencies). Base URL: `http://localhost:8099/api/v2`. CORS is open — call it
straight from browser JS. State is in-memory; restarting gives you a clean slate.

The **agent inbox** (what human support agents see) is at `http://localhost:8099/` —
open it in a second tab while you develop. During judging, this is the screen the
judges watch.

## Help Center

### `GET /help_center/articles`
All published articles. → `{"articles": [{id, title, labels, body}], "count": n}`

### `GET /help_center/articles/search?query=...`
Keyword search, top 5 by relevance. → `{"results": [...], "count": n}`
(It's naive keyword search. If you want semantic retrieval, build it — the full
article list is one GET away.)

## Tickets

### `POST /tickets` — escalate to a human
```json
{
  "ticket": {
    "subject": "Damaged order — replacement requested",
    "priority": "high",                  // low | normal | high | urgent
    "tags": ["damaged", "replacement"],
    "requester": {"name": "Liam Mora", "customer_id": "C102938"},
    "ai_summary": "One-paragraph handoff summary a human can act on in 10 seconds.",
    "comment": {"body": "Full transcript or the customer's message", "author": "customer"}
  }
}
```
→ `201` with `{"ticket": {..., "id": 1001, "status": "new"}}`.
`subject` and `comment.body` are required (`422` otherwise).

### `GET /tickets` · `GET /tickets/{id}`
List / fetch tickets (each includes its `comments` array).

### `POST /tickets/{id}/comments` — add a message to the thread
```json
{"comment": {"body": "text", "author": "customer" | "ai" | "agent"}}
```
Human agents reply from the inbox UI with `author: "agent"`.

### `GET /tickets/{id}/comments`
The thread. **Poll this** to detect agent replies and surface them in your widget.
(An agent reply also flips the ticket status from `new` → `open`.)

### `POST /tickets/{id}/solve`
Mark resolved. Nice touch after the customer confirms they're happy.

## The round-trip your widget must support

1. Widget can't handle something → `POST /tickets` with transcript + `ai_summary`
2. Ticket appears in the agent inbox (judge is watching it)
3. Judge types a reply in the inbox → stored as an `agent` comment
4. Your widget (polling `GET /tickets/{id}/comments`) shows the agent's reply
   to the customer, in the same chat thread
