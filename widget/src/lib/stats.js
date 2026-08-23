const KEY = "ritual.care.stats";

export function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "") || { resolved: 0, escalated: 0, reasons: [] };
  } catch (e) {
    return { resolved: 0, escalated: 0, reasons: [] };
  }
}

export function saveStats(stats) {
  localStorage.setItem(KEY, JSON.stringify(stats));
}
