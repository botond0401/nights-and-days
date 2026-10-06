import { fetchHealthEntries } from "../assets/health-data.js";

const statusEl = document.getElementById("status");
const monthSelect = document.getElementById("month-select");
const summaryEl = document.getElementById("summary");
const triggersEl = document.getElementById("triggers");
const dayListEl = document.getElementById("day-list");

let entries = [];
let selectedMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function populateMonthSelect() {
  const months = new Set(entries.map(e => e.date.slice(0, 7)));
  months.add(selectedMonth);
  const sorted = [...months].sort().reverse();
  monthSelect.innerHTML = sorted.map(ym => `<option value="${ym}">${monthLabel(ym)}</option>`).join("");
  monthSelect.value = selectedMonth;
}

function toMs(e) { return new Date(`${e.date}T${e.time}:00`).getTime(); }

function computeTriggers(symptomType, windowHours) {
  const foodEntries = entries.filter(e => e.type === "food" && e.food);
  const symptomEntries = entries.filter(e =>
    symptomType === "stomach" ? e.type === "stomach" : (e.type === "skin" && e.locations && e.locations.length)
  );

  const displayName = new Map();
  const totalCount = new Map();
  for (const f of foodEntries) {
    const key = f.food.trim().toLowerCase();
    if (!displayName.has(key)) displayName.set(key, f.food.trim());
    totalCount.set(key, (totalCount.get(key) || 0) + 1);
  }

  const beforeCount = new Map();
  for (const s of symptomEntries) {
    const sMs = toMs(s);
    const seen = new Set();
    for (const f of foodEntries) {
      const diffH = (sMs - toMs(f)) / 3600000;
      if (diffH >= 0 && diffH <= windowHours) seen.add(f.food.trim().toLowerCase());
    }
    for (const key of seen) beforeCount.set(key, (beforeCount.get(key) || 0) + 1);
  }

  const results = [];
  for (const [key, total] of totalCount) {
    if (total < 2) continue;
    const before = beforeCount.get(key) || 0;
    if (before === 0) continue;
    results.push({ food: displayName.get(key), before, total, rate: before / total });
  }
  results.sort((a, b) => b.rate - a.rate || b.before - a.before);
  return results.slice(0, 5);
}

function renderTriggerList(results) {
  if (results.length === 0) return `<div class="trigger-empty">Not enough data yet.</div>`;
  return `<ul class="trigger-list">${results.map(r =>
    `<li><span>${r.food}</span><span class="count">${r.before}/${r.total} times (${Math.round(r.rate * 100)}%)</span></li>`
  ).join("")}</ul>`;
}

function renderTriggers() {
  const stomach = computeTriggers("stomach", 24);
  const skin = computeTriggers("skin", 48);
  triggersEl.innerHTML = `
    <h2>Possible triggers</h2>
    <p class="trigger-note">Foods eaten shortly before a symptom, across all logged data — correlation only, not a diagnosis.</p>
    <h3>Stomach (within 24h before)</h3>
    ${renderTriggerList(stomach)}
    <h3>Skin (within 48h before)</h3>
    ${renderTriggerList(skin)}
  `;
}

function renderSummary(monthEntries) {
  const days = new Set(monthEntries.map(e => e.date));
  const stomachDays = new Set(monthEntries.filter(e => e.type === "stomach").map(e => e.date));
  const skinDays = new Set(monthEntries.filter(e => e.type === "skin" && e.locations?.length).map(e => e.date));
  const toiletEntries = monthEntries.filter(e => e.type === "toilet");
  const longToilets = toiletEntries.filter(e => e.duration === "Long");

  const stats = [
    { value: days.size, label: "Days logged" },
    { value: stomachDays.size, label: "Stomach-issue days" },
    { value: skinDays.size, label: "Pimple days" },
    { value: `${toiletEntries.length} (${longToilets.length} long)`, label: "Toilet visits" },
  ];
  summaryEl.innerHTML = stats.map(s => `
    <div><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>
  `).join("");
}

function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function renderDayList(ym) {
  const n = daysInMonth(ym);
  const byDate = new Map();
  for (const e of entries) {
    if (!e.date.startsWith(ym)) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }

  let html = "";
  for (let d = n; d >= 1; d--) {
    const date = `${ym}-${String(d).padStart(2, "0")}`;
    const dayEntries = (byDate.get(date) || []).sort((a, b) => a.time.localeCompare(b.time));
    const hasStomach = dayEntries.some(e => e.type === "stomach");
    const hasSkin = dayEntries.some(e => e.type === "skin" && e.locations?.length);
    const empty = dayEntries.length === 0;

    html += `<div class="day-card${empty ? " empty" : ""}">
      <div class="day-header">
        <span>${date}</span>
        <span class="day-flags">
          ${hasStomach ? `<span class="flag stomach">stomach</span>` : ""}
          ${hasSkin ? `<span class="flag skin">skin</span>` : ""}
        </span>
      </div>
      ${dayEntries.map(e => `<div class="day-row"><span class="time">${e.time}</span>${describe(e)}</div>`).join("")}
    </div>`;
  }
  dayListEl.innerHTML = html;
}

function describe(e) {
  if (e.type === "food") return `🍽 ${e.mealType ? `${e.mealType}: ` : ""}${e.food}`;
  if (e.type === "stomach") return `🤢 ${e.symptom}${e.severity ? ` — ${e.severity}` : ""}`;
  if (e.type === "toilet") return `🚽 ${e.duration}`;
  if (e.type === "skin") {
    const base = e.locations.length ? `🧴 ${e.locations.join(", ")}` : `🧴 clear`;
    return e.note ? `${base} — ${e.note}` : base;
  }
  return e.type;
}

function render() {
  const monthEntries = entries.filter(e => e.date.startsWith(selectedMonth));
  renderSummary(monthEntries);
  renderTriggers();
  renderDayList(selectedMonth);
}

monthSelect.addEventListener("change", () => {
  selectedMonth = monthSelect.value;
  render();
});

(async function init() {
  try {
    statusEl.textContent = "Loading…";
    entries = await fetchHealthEntries();
    populateMonthSelect();
    statusEl.textContent = "";
    render();
  } catch (err) {
    statusEl.textContent = `Couldn't load: ${err.message}`;
  }
})();
