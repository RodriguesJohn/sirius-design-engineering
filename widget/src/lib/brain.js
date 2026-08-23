import { spokenContext } from "./conversation.js";
import { fullName, isSub, latestOrder, ltv, money, openChat, prettyDate, profile, regionLabel, shipNote, truthy } from "./customer.js";

const STOP = new Set("the a an and or to of in for is it my me you your do does can how what when where why are was will with on at be this that from have has our we they them not but if just please".split(" "));
const SYN = {
  return: "returns refund refunds send-back sendback window",
  refund: "return returns money-back reimbursement",
  ship: "shipping delivery deliver transit package tracking late arrived arrival warehouse expedited international",
  cancel: "cancellation cancelling canceled cancelled unsubscribe stop",
  subscription: "subscribe subscriber cadence skip pause manage shipment recurring",
  damaged: "defective broken leaked leak cracked smashed wrong-item incorrect unusable pump",
  promo: "code coupon discount influencer sale credit",
  restock: "sold-out oos waitlist restock stock notify",
  allergen: "allergy allergies vegan shea nut paraben fragrance collagen bovine",
  melatonin: "sleep gummies gummy dosage chamomile theanine",
  retinol: "renew serum tretinoin moisturizer spf layer",
  billing: "charged charge payment receipt paypal apple-pay shop-pay duplicate twice authorization hold",
  exchange: "exchanges swap replace replacement",
};

export const ANGER = /\b(angry|furious|unacceptable|outrageous|ridiculous|incompetent|lawsuit|lawyer|fed up|last chance|worst|scam|fraud|never again|sick of|terrible|horrible|every single|this is the last)\b/i;
export const HUMAN = /\b(human|real person|actual person|agent|manager|supervisor|speak to (a )?(person|someone|human)|talk to (a )?(person|someone|human)|speak with (a )?(person|someone)|want (to talk to )?a person|representative|rep\b|customer service)\b/i;

function tokens(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9+\s-]/g, " ").split(/[\s-]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

function expand(toks) {
  const out = new Set(toks);
  for (const t of toks) {
    for (const [k, syns] of Object.entries(SYN)) {
      const bag = (k + " " + syns).split(" ");
      if (bag.includes(t)) bag.forEach((x) => out.add(x));
    }
  }
  return [...out];
}

export function retrieve(articles, query, topN) {
  const q = expand(tokens(query));
  if (!q.length) return [];
  const scored = articles.map((a) => {
    const title = tokens(a.title);
    const labels = (a.labels || []).flatMap((l) => tokens(l));
    const body = tokens(a.body);
    let s = 0;
    for (const t of q) {
      if (title.includes(t)) s += 5;
      if (labels.includes(t)) s += 4;
      const hits = body.filter((w) => w === t).length;
      if (hits) s += Math.min(3, hits);
    }
    return { article: a, score: s };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, topN || 3);
}

export function bestArticle(articles, query) {
  const hits = retrieve(articles, query, 3);
  if (!hits.length || hits[0].score < 5) return null;
  return hits[0];
}

function sentences(body) {
  return String(body).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function groundedBlurb(query, article) {
  const q = new Set(expand(tokens(query)));
  const ranked = sentences(article.body).map((s) => {
    const st = tokens(s);
    let n = 0;
    st.forEach((w) => { if (q.has(w)) n += 1; });
    return { s, n };
  }).sort((a, b) => b.n - a.n);
  const picked = [];
  for (const r of ranked) {
    if (r.n === 0 && picked.length) break;
    if (picked.length >= 3) break;
    if (!picked.includes(r.s)) picked.push(r.s);
  }
  return (picked.length ? picked : sentences(article.body).slice(0, 2)).join(" ");
}

export function classify(q) {
  const ql = q.toLowerCase();
  if (ANGER.test(q) || HUMAN.test(q)) return "human";
  if (/\b(wholesale|b2b|retailer|career|job|headquarters|ceo|phone number|call me|store location|physical store|klarna|afterpay|affirm|bitcoin|crypto|loyalty points|rewards program|birthday|breastfeed|nursing|pet|dog|cat|child under|toddler)\b/i.test(q)) return "unknown";
  if (/\b(where.*(order|package|shipment)|my order|last order|latest order|tracking|track(ing)? (my|the)|has it shipped|when (will|does) (it|my)|late|stuck in transit|still hasn.t arrived)\b/i.test(ql)) return "order";
  if (/\b(damaged|defective|broken|leaked|leak|wrong item|incorrect item|smashed|cracked|pump)\b/i.test(ql)) return "damaged";
  if (/\b(charged twice|duplicate charge|double charged|billed twice|authorization hold)\b/i.test(ql)) return "billing";
  if (/\b(cancel|cancellation)\b/i.test(ql)) return "cancel";
  if (/\b(skip|pause|cadence|every 30|every 45|every 60|manage (my )?sub)\b/i.test(ql)) return "subscription";
  if (/\b(return|refund|exchange|send it back|money back)\b/i.test(ql)) return "returns";
  if (/\b(ship|shipping|delivery|deliver|international|freight)\b/i.test(ql)) return "shipping";
  if (/\b(promo|code|coupon|discount|influencer|store credit|sale)\b/i.test(ql)) return "promo";
  if (/\b(restock|sold out|waitlist|back in stock|notify me)\b/i.test(ql)) return "restock";
  if (/\b(retinol|renew serum|tretinoin|how (do|should) i (use|apply)|layer)\b/i.test(ql)) return "serum";
  if (/\b(melatonin|sleep gummies|gummies|dosage|chamomile)\b/i.test(ql)) return "gummies";
  if (/\b(allerg|vegan|shea|paraben|ingredient|fragrance|collagen|nut)\b/i.test(ql)) return "ingredients";
  return "general";
}

export function shouldEscalate(customer, intent, query, hit) {
  if (ANGER.test(query)) return { yes: true, reason: "frustrated customer, do not argue" };
  if (HUMAN.test(query)) return { yes: true, reason: "asked for a person" };
  if (intent === "damaged") return { yes: true, reason: "damaged / wrong-item claim needs photo review" };
  if (intent === "billing" && /\b(twice|duplicate|double|both charges posted)\b/i.test(query)) {
    return { yes: true, reason: "possible duplicate charge, refund window is 24 hours once posted" };
  }
  if (intent === "unknown") return { yes: true, reason: "not in the help center, do not invent" };
  if (intent === "general" && !hit) return { yes: true, reason: "no grounded article for this question" };
  if (intent === "order" && /\b(5\+|five days|week|stuck|hasn.t moved|never got|stolen|lost)\b/i.test(query)) {
    return { yes: true, reason: "carrier investigation, policy says contact support" };
  }
  const oc = openChat(customer);
  if (oc && /cancel/i.test(JSON.stringify(oc.messages || [])) && isSub(customer) && intent === "cancel") {
    return { yes: true, reason: "promised cancel never finished, still a subscriber" };
  }
  if (oc && intent === "order" && /late|tracking|order|package|arriv/i.test(query)) {
    return { yes: true, reason: "repeat of an unresolved shipping complaint" };
  }
  if (intent === "cancel" && /\b(just cancel|do it( for me)?|already (asked|told)|still (active|subscribed|being charged))\b/i.test(query)) {
    return { yes: true, reason: "wants the cancellation action performed" };
  }
  if (/\b(expired).*(code|promo)|influencer code\b/i.test(query) && /\b(still|honor|exception|please)\b/i.test(query)) {
    return { yes: true, reason: "asking to override expired-code policy" };
  }
  return { yes: false };
}

export function triage(customer, intent, query) {
  const angry = ANGER.test(query);
  const value = ltv(customer);
  let priority = "normal";
  if ((angry && value >= 400) || value >= 700) priority = "urgent";
  else if (angry || intent === "damaged" || intent === "billing" || value >= 400) priority = "high";
  const tags = ["widget"];
  if (value >= 500) tags.push("vip");
  if (isSub(customer)) tags.push("subscriber");
  if (profile(customer).region) tags.push("region-" + String(profile(customer).region).toLowerCase());
  if (intent === "damaged" || /\b(damaged|leaked|defective|wrong item)\b/i.test(query)) tags.push("damaged", "replacement");
  if (intent === "billing" || /\b(charged|billing|refund the duplicate)\b/i.test(query)) tags.push("billing");
  if (intent === "cancel" || /\bcancel/i.test(query)) tags.push("cancellation");
  if (intent === "order" || /\b(order|tracking|package|ship)/i.test(query)) tags.push("shipping");
  if (openChat(customer)) tags.push("unresolved-history");
  if (angry) tags.push("frustrated");
  return { priority, tags };
}

function suggest(intent) {
  if (intent === "damaged") return "Ask for a photo if missing; offer free replacement or refund, no return needed (within 14 days of delivery).";
  if (intent === "billing") return "Check whether the second charge is an auth hold vs posted; if posted, refund the duplicate within 24 hours.";
  if (intent === "cancel") return "Cancel the subscription immediately in account tools; confirm whether a shipment already processed in the 48-hour window.";
  if (intent === "order") return "Pull carrier tracking and update the customer; investigate if no scan for 5+ business days.";
  return "Read the transcript and the AI notes; reply in this ticket. It appears in the widget.";
}

export function handoffSummary(customer, intent, query, reason) {
  const p = profile(customer);
  const last = latestOrder(customer);
  const oc = openChat(customer);
  const bits = [
    `${fullName(customer)} · ${p.customer_id} · ${regionLabel(p.region)} · ${isSub(customer) ? "subscriber" : "not a subscriber"} · ${money(p.lifetime_value_usd)} LTV${ltv(customer) >= 500 ? " · VIP" : ""}.`,
    last ? `Latest order ${last.order_id}: ${last.product} (${money(last.amount_usd)}) on ${prettyDate(last.order_date)}${truthy(last.is_subscription_order) ? ", subscription shipment" : ""}.` : "No orders on file.",
    oc ? `Open past chat ${oc.chat_id} with ${oc.agent_name} (${prettyDate(oc.started_at)}, CSAT ${oc.csat}, unresolved): "${(oc.messages.slice(-1)[0] || {}).text || ""}".` : "No open historical chats.",
    `Now: ${intent}. Reason to escalate: ${reason}.`,
    `They said: “${query}”.`,
    `Suggested next step: ${suggest(intent)}. Do not re-ask for email. The account is already identified.`,
  ];
  return bits.join(" ");
}

export function subjectFor(customer, intent, query) {
  const name = fullName(customer);
  if (intent === "damaged") return "Damaged / wrong item: " + name;
  if (intent === "billing") return "Billing review: " + name;
  if (intent === "cancel") return "Subscription cancellation: " + name;
  if (intent === "order") return "Order / tracking: " + name;
  if (ANGER.test(query)) return "Urgent follow-up: " + name;
  return "Widget handoff: " + name;
}

export function answerPolicy(customer, intent, query, hit) {
  const p = profile(customer);
  const last = latestOrder(customer);
  const src = hit && hit.article;
  if (!src) return null;

  const contextual = spokenContext(customer, intent);
  if (contextual) return { text: contextual.text, source: src.title };

  if (intent === "returns") {
    return {
      text: `Returns are 30 days from delivery, product at least half full, refund to the original payment. I can have the team email a prepaid label${last ? ` for ${last.order_id}` : ""}. Refunds post 3-5 business days after the warehouse gets it.`,
      source: src.title,
    };
  }
  if (intent === "shipping" || intent === "order") {
    const orderLine = last
      ? `Your latest order is ${last.order_id}, ${last.product}, placed ${prettyDate(last.order_date)}.`
      : "I don’t see any orders on this account yet.";
    return {
      text: `${orderLine} ${shipNote(customer)} Tracking goes out by email when it leaves the warehouse.`,
      source: src.title,
    };
  }
  if (intent === "cancel") {
    return {
      text: `${p.first_name}, you’re ${isSub(customer) ? "on a subscription right now" : "not listed as a subscriber"}. You can cancel in Account → Subscription → Cancel, or I can have someone do it. No fee. If a shipment already processed (48 hours before ship), that one still goes out.`,
      source: src.title,
    };
  }
  if (intent === "subscription") {
    return {
      text: `Subscriptions are 15% off and ship every 30, 45, or 60 days. Skip, pause (up to 3 months), change cadence, or swap products in Account → Subscription → Manage. Changes apply immediately if they’re made at least 48 hours before the next shipment. No minimum, no fee to change.`,
      source: src.title,
    };
  }
  if (intent === "promo") {
    return {
      text: `One promo code per order. Codes don’t combine with each other, but they do stack with the 15% subscription discount. They can’t be applied after an order is placed. Expired influencer codes can’t be honored. Store credit from refunds or referrals never expires and applies automatically at checkout. We run one sitewide sale per quarter.`,
      source: src.title,
    };
  }
  if (intent === "billing") {
    return {
      text: `We take major cards, PayPal, Apple Pay, and Shop Pay. Subscription orders charge when they process, 48 hours before shipping, and you get a reminder email 3 days before. A “duplicate” is often a temporary authorization hold that the bank drops in 2-3 business days. If both charges actually posted${last ? ` on ${last.order_id}` : ""}, I’ll get a person on it. Policy is a refund of the duplicate within 24 hours.`,
      source: src.title,
    };
  }
  if (intent === "restock") {
    return {
      text: `Sold-out products have a “Notify me” button on the product page. Waitlist members get a 24-hour early-access window before the restock is public. Most products restock every 3-4 weeks. We can’t reserve or hold stock outside the waitlist, including for subscribers.`,
      source: src.title,
    };
  }
  if (intent === "serum") {
    return {
      text: `Apply 2–3 drops of Renew Serum to clean, dry skin morning and night, before moisturizer. Safe to layer with retinol: serum first, wait 60 seconds, then retinol. It pairs with Glow SPF 40 in the daytime. Not recommended with prescription tretinoin unless your dermatologist says so. A 30ml bottle lasts about 6 weeks used twice daily.`,
      source: src.title,
    };
  }
  if (intent === "gummies") {
    return {
      text: `Each serving is 2 gummies: 3mg melatonin, 200mg chamomile extract, 100mg L-theanine. Take them 30-45 minutes before bed. Don’t exceed one serving per 24 hours. Vegan, gluten-free, no artificial colors. Not for anyone under 18 or during pregnancy. Check with a physician. 30 servings per jar.`,
      source: src.title,
    };
  }
  if (intent === "ingredients") {
    return {
      text: `Everything is cruelty-free and formulated without parabens, phthalates, or synthetic fragrance. Velvet Body Butter and Hand Repair contain shea butter (tree-nut derived). Skip those if you have a tree-nut allergy. Collagen Peptides are bovine, so not vegan; every other supplement is. Full lists live on each product page under “What’s inside.” For sensitive skin, patch-test on the inner arm for 24 hours.`,
      source: src.title,
    };
  }
  if (intent === "damaged") {
    return {
      text: `If something arrived damaged, defective, or wrong, contact us within 14 days of delivery with a photo of the item and packaging. We’ll send a free replacement or a full refund, your choice, and you do not need to return the damaged item. These claims don’t use up the 30-day return window.\n\nI’m sending this to the team with ${last ? last.order_id : "your account"} so they can review a photo.`,
      source: src.title,
    };
  }
  return { text: groundedBlurb(query, src), source: src.title };
}

export function greeting(customer) {
  const p = profile(customer);
  const last = latestOrder(customer);
  const oc = openChat(customer);
  const name = p.first_name || "there";
  if (oc && /cancel/i.test(JSON.stringify(oc.messages || []))) {
    return `Hi ${name}. I can see you’re ${isSub(customer) ? "still listed as a subscriber" : "on the account"} and that you already asked ${oc.agent_name} to cancel on ${prettyDate(oc.started_at)}. Tell me what you need and I’ll handle it from here.`;
  }
  if (oc && /tracking|late|package|hasn.?t moved|my order/i.test(JSON.stringify(oc.messages || []))) {
    return `Hi ${name}. I have your account, including ${last ? last.order_id + " (" + last.product + ")" : "your recent orders"} and the open shipping thread with ${oc.agent_name} from ${prettyDate(oc.started_at)}. I’m not going to make you start over. What’s going on?`;
  }
  if (last && !((customer.chats || []).length) && ltv(customer) > 500) {
    return `Good to see you again, ${name}. It’s been a while since ${last.product} on ${prettyDate(last.order_date)}. What can I help with?`;
  }
  if (last && (customer.chats || []).length === 0) {
    return `Hi ${name}. I can see your ${last.product} order (${last.order_id}, ${prettyDate(last.order_date)}). What do you need?`;
  }
  if (last) {
    const good = ((customer.chats || []).find((ch) => (ch.resolved === true || ch.resolved === "true") && Number(ch.csat) >= 4));
    if (good) {
      return `Hi ${name}. I have ${last.product} (${last.order_id}) in front of me. What do you need?`;
    }
    return `Hi ${name}. I have ${last.product} (${last.order_id}) in front of me${isSub(customer) ? ", and you’re on a subscription" : ""}. How can I help?`;
  }
  return `Hi ${name}. I already have your account. No email needed. What can I help with?`;
}

export function ticketPayload(customer, conversation, query, intent, reason) {
  const p = profile(customer);
  const { priority, tags } = triage(customer, intent, query);
  const transcript = conversation.map((m) => {
    const who = m.role === "user" ? "customer" : m.role === "agent" ? "agent" : "ai";
    return who + ": " + m.text;
  }).join("\n");
  return {
    ticket: {
      subject: subjectFor(customer, intent, query),
      priority,
      tags,
      requester: { name: fullName(customer), customer_id: p.customer_id },
      ai_summary: handoffSummary(customer, intent, query, reason),
      comment: { body: transcript || query, author: "customer" },
    },
  };
}
