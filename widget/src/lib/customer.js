export function truthy(v) {
  return v === true || v === "True" || v === "true" || v === 1 || v === "1";
}

export function money(n) {
  const x = parseFloat(n);
  return Number.isFinite(x) ? "$" + x.toFixed(2).replace(/\.00$/, "") : String(n);
}

export function prettyDate(d) {
  if (!d) return "";
  const dt = new Date(String(d).length <= 10 ? d + "T00:00:00" : d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function profile(customer) {
  return (customer && customer.profile) || {};
}

export function fullName(customer) {
  const p = profile(customer);
  return [p.first_name, p.last_name].filter(Boolean).join(" ");
}

export function ltv(customer) {
  return parseFloat(profile(customer).lifetime_value_usd) || 0;
}

export function isSub(customer) {
  return truthy(profile(customer).is_subscriber);
}

export function latestOrder(customer) {
  const orders = (customer && customer.orders) || [];
  if (!orders.length) return null;
  return orders.slice().sort((a, b) => String(b.order_date).localeCompare(String(a.order_date)))[0];
}

export function openChat(customer) {
  return ((customer && customer.chats) || []).find((ch) => ch.resolved === false || ch.resolved === "false");
}

export function regionLabel(region) {
  const map = { FR: "France", UK: "the UK", CA: "Canada", AU: "Australia", DE: "Germany" };
  if (map[region]) return map[region];
  if (String(region).startsWith("US")) return "the US";
  return region;
}

export function compactCustomer(customer) {
  if (!customer) return {};
  return {
    profile: customer.profile || {},
    orders: (customer.orders || []).slice(-4),
    chats: ((customer.chats) || []).map((ch) => ({
      chat_id: ch.chat_id,
      agent_name: ch.agent_name,
      started_at: ch.started_at,
      resolved: ch.resolved,
      csat: ch.csat,
      messages: ch.messages || [],
    })),
  };
}

export function shipNote(customer) {
  const region = profile(customer).region;
  const intl = ["FR", "UK", "CA", "AU", "DE"].includes(region);
  if (intl) {
    return `You’re in ${regionLabel(region)}, so this ships internationally, 7-14 business days, $19.95 flat.`;
  }
  return "US orders ship from Nevada within 1 business day. Standard is 3–5 business days ($5.95, or free over $50). Expedited is 2 business days ($14.95).";
}
