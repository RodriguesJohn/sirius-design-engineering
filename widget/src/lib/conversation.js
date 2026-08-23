import { isSub, latestOrder, ltv, openChat, prettyDate, profile } from "./customer.js";

export function chatBlob(chat) {
  return JSON.stringify((chat && chat.messages) || []);
}

export function openShipping(customer) {
  const oc = openChat(customer);
  return !!(oc && /tracking|late|package|hasn.?t moved|my order/i.test(chatBlob(oc)));
}

export function unfinishedCancel(customer) {
  const oc = openChat(customer);
  return !!(oc && isSub(customer) && /cancel/i.test(chatBlob(oc)));
}

export function lastCustomerLine(chat) {
  const msgs = (chat && chat.messages) || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "customer") return msgs[i].text || "";
  }
  return "";
}

export function situation(customer) {
  const p = profile(customer);
  const last = latestOrder(customer);
  const oc = openChat(customer);
  const resolved = ((customer && customer.chats) || []).find((ch) => ch.resolved === true || ch.resolved === "true");
  return {
    first_name: p.first_name || "",
    customer_id: p.customer_id || "",
    region: p.region || "",
    subscriber: isSub(customer),
    ltv: ltv(customer),
    vip: ltv(customer) >= 500,
    latest_order: last
      ? { id: last.order_id, product: last.product, date: last.order_date, subscription: last.is_subscription_order }
      : null,
    open_thread: oc
      ? {
          id: oc.chat_id,
          agent: oc.agent_name,
          date: oc.started_at,
          csat: oc.csat,
          last_customer_line: lastCustomerLine(oc),
          shipping: openShipping(customer),
          cancel: unfinishedCancel(customer),
        }
      : null,
    last_good_chat: resolved
      ? { agent: resolved.agent_name, csat: resolved.csat, date: resolved.started_at }
      : null,
    first_order: ((customer && customer.orders) || []).length === 1,
    quiet: !((customer && customer.chats) || []).length && !!last,
  };
}

export function connectPrompt(customer, intent, reason) {
  if (intent === "human") {
    return "I’ll bring a person in with your account already attached. Stay here. Their reply will land in this chat.";
  }
  if (unfinishedCancel(customer) || intent === "cancel") {
    return "I’ll have someone finish the cancel now. No save offer.";
  }
  if (openShipping(customer) || intent === "order") {
    return "I’m putting a person on the carrier with this order. Stay here.";
  }
  if (intent === "damaged") {
    return "I’m sending this to the team with your account so they can review a photo.";
  }
  return reason && /not in the help center/i.test(reason)
    ? "That isn’t in the help center. Want me to pass it to someone who can look it up?"
    : "Want me to pass this to someone on the team?";
}

export function mustActNow(customer, intent, query) {
  if (intent === "damaged") return true;
  if (intent === "human") return true;
  if (openShipping(customer) && (intent === "order" || intent === "shipping")) return true;
  if (unfinishedCancel(customer) && intent === "cancel") return true;
  return false;
}

export function spokenContext(customer, intent) {
  const p = profile(customer);
  const last = latestOrder(customer);
  const oc = openChat(customer);
  const name = p.first_name || "there";

  if ((intent === "order" || intent === "shipping") && openShipping(customer)) {
    return {
      text: `${name}, ${oc.agent_name} told you ${prettyDate(oc.started_at)} that logistics would reply in 3-5 days. That already failed. I have ${last ? last.order_id + " (" + last.product + ")" : "your order"} and I’m putting a person on the carrier now. Stay here. Their reply will land in this chat.`,
    };
  }

  if (intent === "cancel" && unfinishedCancel(customer)) {
    return {
      text: `You’re still listed as a subscriber. ${oc.agent_name} told you the cancel was done on ${prettyDate(oc.started_at)}. I’ll have someone finish it now. No discount, no cadence change. Stay here. Their reply will land in this chat.`,
    };
  }

  if (intent === "damaged") {
    return {
      text: `If it arrived damaged, wrong, or defective, we replace or refund it. No return needed, as long as it’s within 14 days. I’m sending ${last ? last.order_id : "your account"} to the team. Stay here. Their reply will land in this chat.`,
    };
  }

  return null;
}
