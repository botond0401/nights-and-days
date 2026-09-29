import { fetchNights } from "../assets/data.js";

const DATA_START_YEAR = 2024;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SERIES_SLOTS = ["--series-1","--series-2","--series-3","--series-4","--series-5","--series-6","--series-7","--series-8"];
const OTHER_COLOR = "var(--text-muted)";
const EMPTY_COLOR = "var(--gridline)";

const statusEl = document.getElementById("status");
const yearSelect = document.getElementById("year-select");
const tabsEl = document.getElementById("scope-tabs");
const heatmapSection = document.getElementById("heatmap-section");
const heatmapEl = document.getElementById("heatmap");
const legendEl = document.getElementById("legend");
const summaryEl = document.getElementById("summary");
const countriesTable = document.querySelector("#countries-table tbody");
const townsTable = document.querySelector("#towns-table tbody");
const tooltip = document.getElementById("tooltip");

let state = { scope: "year", year: new Date().getFullYear() };
let records = [];
let colorMap = new Map(); // place -> css var or OTHER_COLOR

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildColorMap(allRecords) {
  const counts = new Map();
  for (const r of allRecords) {
    counts.set(r.place, (counts.get(r.place) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const map = new Map();
  ranked.forEach(([place], i) => {
    if (i < SERIES_SLOTS.length) map.set(place, `var(${SERIES_SLOTS[i]})`);
  });
  return map;
}

function colorFor(place) {
  return colorMap.get(place) || OTHER_COLOR;
}

function label(record) {
  const d = record.date;
  if (record.type === "transit") {
    return `${d} — in transit (${record.place}), departed ${record.country}`;
  }
  return `${d} — ${record.place}, ${record.country}`;
}

function populateYearSelect() {
  const maxYear = Math.max(new Date().getFullYear(), ...records.map(r => Number(r.date.slice(0, 4))), DATA_START_YEAR);
  yearSelect.innerHTML = "";
  for (let y = maxYear; y >= DATA_START_YEAR; y--) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
  yearSelect.value = state.year;
}

function renderHeatmap(year) {
  heatmapEl.innerHTML = "";

  const byDate = new Map(records.filter(r => r.date.startsWith(String(year))).map(r => [r.date, r]));

  heatmapEl.appendChild(document.createElement("div")); // corner
  for (let d = 1; d <= 31; d++) {
    const cell = document.createElement("div");
    cell.className = "hm-daynum";
    cell.textContent = d;
    heatmapEl.appendChild(cell);
  }

  for (let m = 0; m < 12; m++) {
    const monthLabel = document.createElement("div");
    monthLabel.className = "hm-month";
    monthLabel.textContent = MONTHS[m];
    heatmapEl.appendChild(monthLabel);

    const dim = daysInMonth(year, m);
    for (let d = 1; d <= 31; d++) {
      const cell = document.createElement("div");
      if (d > dim) {
        cell.className = "hm-cell na";
        heatmapEl.appendChild(cell);
        continue;
      }
      const dateStr = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const rec = byDate.get(dateStr);
      cell.className = "hm-cell" + (rec ? " filled" : "");
      cell.style.background = rec ? colorFor(rec.place) : EMPTY_COLOR;
      if (rec) {
        cell.addEventListener("mouseenter", (e) => showTooltip(e, label(rec)));
        cell.addEventListener("mousemove", moveTooltip);
        cell.addEventListener("mouseleave", hideTooltip);
      }
      heatmapEl.appendChild(cell);
    }
  }
}

function showTooltip(e, text) {
  tooltip.textContent = text;
  tooltip.hidden = false;
  moveTooltip(e);
}
function moveTooltip(e) {
  tooltip.style.left = e.clientX + "px";
  tooltip.style.top = e.clientY + "px";
}
function hideTooltip() { tooltip.hidden = true; }

function renderLegend(scopedRecords) {
  const placesInScope = new Set(scopedRecords.map(r => r.place));
  const entries = [...colorMap.entries()].filter(([place]) => placesInScope.has(place));
  legendEl.innerHTML = "";
  for (const [place, color] of entries) {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${place}`;
    legendEl.appendChild(item);
  }
  const hasOther = scopedRecords.some(r => !colorMap.has(r.place));
  if (hasOther) {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${OTHER_COLOR}"></span>Other`;
    legendEl.appendChild(item);
  }
}

function rankTable(tbodyEl, counts, totalForPct, { showSwatch } = {}) {
  tbodyEl.innerHTML = "";
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  ranked.forEach(([name, count], i) => {
    const tr = document.createElement("tr");
    const pct = totalForPct ? ((count / totalForPct) * 100).toFixed(1) : "0.0";
    const swatch = showSwatch ? `<span class="legend-swatch" style="background:${colorFor(name)}"></span>` : "";
    tr.innerHTML = `
      <td class="rank">${i + 1}</td>
      <td class="name-cell">${swatch}${name}</td>
      <td class="num">${count}</td>
      <td class="num">${pct}%</td>`;
    tbodyEl.appendChild(tr);
  });
  if (ranked.length === 0) {
    tbodyEl.innerHTML = `<tr><td colspan="4" class="empty-note">No data yet.</td></tr>`;
  }
}

function renderTables(scopedRecords) {
  const countryCounts = new Map();
  const townCounts = new Map();
  for (const r of scopedRecords) {
    countryCounts.set(r.country, (countryCounts.get(r.country) || 0) + 1);
    if (r.type === "stay") {
      townCounts.set(r.place, (townCounts.get(r.place) || 0) + 1);
    }
  }
  rankTable(countriesTable, countryCounts, scopedRecords.length, { showSwatch: false });
  const stayCount = scopedRecords.filter(r => r.type === "stay").length;
  rankTable(townsTable, townCounts, stayCount, { showSwatch: true });
}

function renderSummary(scopedRecords) {
  const countries = new Set(scopedRecords.map(r => r.country)).size;
  const towns = new Set(scopedRecords.filter(r => r.type === "stay").map(r => r.place)).size;
  const transitNights = scopedRecords.filter(r => r.type === "transit").length;

  const stats = [
    { value: scopedRecords.length, label: "Nights logged" },
    { value: countries, label: "Countries" },
    { value: towns, label: "Towns" },
    { value: transitNights, label: "Nights in transit" },
  ];

  if (state.scope === "lifetime" && records.length) {
    stats.push({ value: `${records[0].date} → ${records[records.length - 1].date}`, label: "Range" });
  }

  summaryEl.innerHTML = stats.map(s => `
    <div>
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>`).join("");
}

function render() {
  const scopedRecords = state.scope === "lifetime"
    ? records
    : records.filter(r => r.date.startsWith(String(state.year)));

  heatmapSection.style.display = state.scope === "lifetime" ? "none" : "";
  yearSelect.style.display = state.scope === "lifetime" ? "none" : "";

  if (state.scope === "year") renderHeatmap(state.year);
  renderLegend(scopedRecords);
  renderSummary(scopedRecords);
  renderTables(scopedRecords);
}

tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  [...tabsEl.children].forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
  state.scope = btn.dataset.scope;
  render();
});

yearSelect.addEventListener("change", () => {
  state.year = Number(yearSelect.value);
  render();
});

(async function init() {
  try {
    statusEl.textContent = "Loading…";
    records = await fetchNights();
    colorMap = buildColorMap(records);
    populateYearSelect();
    statusEl.textContent = "";
    render();
  } catch (err) {
    statusEl.textContent = `Couldn't load data: ${err.message}`;
  }
})();
