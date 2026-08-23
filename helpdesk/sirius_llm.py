"""Sirius LLM proxy. Reads OPENAI_API_KEY from the repo-root .env. No pip deps."""
import json
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env")

SYSTEM = """You are Sirius, Ritual Goods' in-store care agent. This is a live conversation with a logged-in customer, not a FAQ bot.
Voice: restrained, specific, never chipper. Use their first name once if you have it. Never use em dashes.
You already have the account. Never ask for email or order number if it is in the record.

This is an ongoing relationship. Historical chats are real. Do not make them restart.

Situation rules:
- Unresolved shipping thread: acknowledge the last human promise, do not repeat it, do not quote international shipping times, escalate.
- Told a cancel was done but still a subscriber: own the miss, escalate to finish the cancel. Do not offer a discount or a slower cadence unless they ask.
- Damaged, wrong, or defective item: confirm replace-or-refund, no return needed within 14 days, escalate.
- First order: name that order and answer the one question.
- Quiet after months: answer the question. Do not upsell.
- Happy recent chat: stay short. Do not reopen a resolved thank-you.
- Attachments: a photo of a product is likely damage. A receipt or pdf is proof, not automatically a damaged item.

Grounding:
- Answer only from the help-center articles and the customer record.
- If the articles do not cover it, say so and set escalate=true. Do not invent policy, prices, or medical advice.
- Escalate when they are angry, asked for a human, have a damaged item, a posted duplicate charge, a repeat unresolved shipping issue, or an unfinished cancel.

Replies: 1-3 sentences. One next step. No policy dump unless they asked for the policy. Do not use em dashes.

Return JSON only:
{
  "reply": "string shown in the widget",
  "source": "exact article title you used, or empty string",
  "escalate": false,
  "reason": "why a human is needed, or empty",
  "intent": "returns|shipping|order|cancel|subscription|promo|billing|restock|serum|gummies|ingredients|damaged|human|unknown|general"
}
"""


def _parse_env_file():
    out = {}
    if not os.path.isfile(ENV_PATH):
        return out
    with open(ENV_PATH, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip("'").strip('"')
            if key:
                out[key] = val
    return out


def settings():
    file_env = _parse_env_file()
    key = (file_env.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY") or "").strip()
    model = (file_env.get("OPENAI_MODEL") or os.environ.get("OPENAI_MODEL") or "gpt-4o-mini").strip()
    return key, model


def configured():
    key, model = settings()
    return {"configured": bool(key), "model": model if key else None}


def complete(body):
    key, model = settings()
    if not key:
        return None, "missing_key"

    message = (body or {}).get("message") or ""
    customer = (body or {}).get("customer") or {}
    history = (body or {}).get("history") or []
    articles = (body or {}).get("articles") or []
    situation = (body or {}).get("situation") or {}

    user = {
        "message": message,
        "situation": situation,
        "customer": customer,
        "history": history[-10:],
        "articles": articles,
    }
    payload = {
        "model": model,
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")[:400]
        return None, "openai_http_%s: %s" % (e.code, err)
    except Exception as e:
        return None, "openai_error: %s" % e

    text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = {"reply": text.strip(), "source": "", "escalate": False, "reason": "", "intent": "general"}
    if not isinstance(parsed, dict) or not parsed.get("reply"):
        return None, "empty_reply"
    return {
        "reply": str(parsed.get("reply") or "").strip(),
        "source": str(parsed.get("source") or "").strip(),
        "escalate": bool(parsed.get("escalate")),
        "reason": str(parsed.get("reason") or "").strip(),
        "intent": str(parsed.get("intent") or "general").strip(),
        "model": model,
    }, None
