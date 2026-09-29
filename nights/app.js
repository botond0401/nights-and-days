import { fetchNights } from "../assets/data.js";

const DATA_START_YEAR = 2024;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Fixed per user request; everything else hand-picked for spread across the hue wheel.
const COUNTRY_COLORS = {
  "Austria":        { light: "#2a78d6", dark: "#3987e5" },
  "Hungary":        { light: "#008300", dark: "#008300" },
  "Switzerland":    { light: "#e34948", dark: "#e66767" },
  "Poland":         { light: "#e87ba4", dark: "#d55181" },
  "Thailand":       { light: "#eda100", dark: "#c98500" },
  "Croatia":        { light: "#eb6834", dark: "#d95926" },
  "Indonesia":      { light: "#1baf7a", dark: "#199e70" },
  "Germany":        { light: "#4a3aa7", dark: "#9085e9" },
  "Italy":          { light: "#8b5e3c", dark: "#a97c50" },
  "Czechia":        { light: "#2c3e78", dark: "#5568a8" },
  "Singapore":      { light: "#0e7c86", dark: "#14a3b0" },
  "Spain":          { light: "#b8860b", dark: "#d4a017" },
  "Slovenia":       { light: "#d46a5f", dark: "#e08a80" },
  "England":        { light: "#5a6b7a", dark: "#7f93a3" },
  "India":          { light: "#8e4585", dark: "#b064a6" },
};
const FALLBACK_COUNTRY_COLOR = { light: "#767676", dark: "#9a9a9a" };
const TRANSIT_COLOR = { light: "#000000", dark: "#000000" };
const OTHER_BAR_COLOR = { light: "#b7b6ae", dark: "#57564f" };
const EMPTY_COLOR = "var(--gridline)";

function isDarkMode() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function pick(pair) { return isDarkMode() ? pair.dark : pair.light; }

// ---- hex <-> HSL, for generating per-town shades of a country's base hue ----
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}
function hexToHsl(hex) { return rgbToHsl(...hexToRgb(hex)); }
function hslToHex(h, s, l) { return rgbToHex(...hslToRgb(h, s, l)); }

// rank 0 = the country's exact base color; each further rank alternates darker/lighter.
function shadeForRank(baseHex, rank) {
  if (!rank) return baseHex;
  const [h, s, l] = hexToHsl(baseHex);
  const dir = rank % 2 === 1 ? -1 : 1;
  const magnitude = Math.ceil(rank / 2);
  const newL = Math.min(82, Math.max(18, l + dir * magnitude * 11));
  return hslToHex(h, Math.max(25, s), newL);
}

function countryBase(country) {
  return pick(COUNTRY_COLORS[country] || FALLBACK_COUNTRY_COLOR);
}
function transitColor() { return pick(TRANSIT_COLOR); }
function otherBarColor() { return pick(OTHER_BAR_COLOR); }

const statusEl = document.getElementById("status");
const scopeSelect = document.getElementById("scope-select");
const heatmapContainerEl = document.getElementById("heatmap-container");
const legendEl = document.getElementById("legend");
const summaryEl = document.getElementById("summary");
const countryBarChartEl = document.getElementById("country-bar-chart");
const countriesTable = document.querySelector("#countries-table tbody");
const townsTable = document.querySelector("#towns-table tbody");
const tooltip = document.getElementById("tooltip");

let state = { scope: "year", year: new Date().getFullYear() };
let records = [];
let townRanks = new Map(); // "country||place" -> rank (lifetime-based, stable across views)

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildTownRanks(allRecords) {
  const byCountry = new Map();
  for (const r of allRecords) {
    if (r.type !== "stay") continue;
    if (!byCountry.has(r.country)) byCountry.set(r.country, new Map());
    const m = byCountry.get(r.country);
    m.set(r.place, (m.get(r.place) || 0) + 1);
  }
  const ranks = new Map();
  for (const [country, counts] of byCountry) {
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([place], i) => ranks.set(`${country}||${place}`, i));
  }
  return ranks;
}

function colorForTown(country, place) {
  const rank = townRanks.get(`${country}||${place}`) ?? 0;
  return shadeForRank(countryBase(country), rank);
}
function colorForRecord(r) {
  return r.type === "transit" ? transitColor() : colorForTown(r.country, r.place);
}

function label(record) {
  const d = record.date;
  if (record.type === "transit") {
    return `${d} — in transit (${record.place}), departed ${record.country}`;
  }
  return `${d} — ${record.place}, ${record.country}`;
}

function maxYearInData() {
  return Math.max(new Date().getFullYear(), ...records.map(r => Number(r.date.slice(0, 4))), DATA_START_YEAR);
}

function populateScopeSelect() {
  const maxYear = maxYearInData();
  scopeSelect.innerHTML = "";
  for (let y = maxYear; y >= DATA_START_YEAR; y--) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = y;
    scopeSelect.appendChild(opt);
  }
  const lifetimeOpt = document.createElement("option");
  lifetimeOpt.value = "lifetime";
  lifetimeOpt.textContent = `${DATA_START_YEAR}–today`;
  scopeSelect.appendChild(lifetimeOpt);
  scopeSelect.value = state.scope === "lifetime" ? "lifetime" : String(state.year);
}

function renderHeatmapGrid(container, year) {
  container.innerHTML = "";
  const byDate = new Map(records.filter(r => r.date.startsWith(String(year))).map(r => [r.date, r]));

  container.appendChild(document.createElement("div"));
  for (let d = 1; d <= 31; d++) {
    const cell = document.createElement("div");
    cell.className = "hm-daynum";
    cell.textContent = d;
    container.appendChild(cell);
  }

  for (let m = 0; m < 12; m++) {
    const monthLabel = document.createElement("div");
    monthLabel.className = "hm-month";
    monthLabel.textContent = MONTHS[m];
    container.appendChild(monthLabel);

    const dim = daysInMonth(year, m);
    for (let d = 1; d <= 31; d++) {
      const cell = document.createElement("div");
      if (d > dim) {
        cell.className = "hm-cell na";
        container.appendChild(cell);
        continue;
      }
      const dateStr = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const rec = byDate.get(dateStr);
      cell.className = "hm-cell" + (rec ? " filled" : "");
      cell.style.background = rec ? colorForRecord(rec) : EMPTY_COLOR;
      if (rec) {
        cell.addEventListener("mouseenter", (e) => showTooltip(e, label(rec)));
        cell.addEventListener("mousemove", moveTooltip);
        cell.addEventListener("mouseleave", hideTooltip);
      }
      container.appendChild(cell);
    }
  }
}

function renderHeatmapSection() {
  heatmapContainerEl.innerHTML = "";
  const years = state.scope === "lifetime"
    ? Array.from({ length: maxYearInData() - DATA_START_YEAR + 1 }, (_, i) => DATA_START_YEAR + i)
    : [state.year];

  for (const y of years) {
    const block = document.createElement("div");
    block.className = "heatmap-year-block";
    if (state.scope === "lifetime") {
      const yearLabel = document.createElement("div");
      yearLabel.className = "heatmap-year-label";
      yearLabel.textContent = y;
      block.appendChild(yearLabel);
    }
    const grid = document.createElement("div");
    grid.className = "hm-grid";
    block.appendChild(grid);
    heatmapContainerEl.appendChild(block);
    renderHeatmapGrid(grid, y);
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
  const byCountry = new Map(); // country -> Set(place)
  const countryTotals = new Map();
  let hasTransit = false;
  for (const r of scopedRecords) {
    countryTotals.set(r.country, (countryTotals.get(r.country) || 0) + 1);
    if (r.type === "transit") { hasTransit = true; continue; }
    if (!byCountry.has(r.country)) byCountry.set(r.country, new Set());
    byCountry.get(r.country).add(r.place);
  }
  const orderedCountries = [...byCountry.keys()].sort((a, b) => (countryTotals.get(b) || 0) - (countryTotals.get(a) || 0));

  legendEl.innerHTML = "";
  for (const country of orderedCountries) {
    const places = [...byCountry.get(country)].sort(
      (a, b) => (townRanks.get(`${country}||${a}`) ?? 0) - (townRanks.get(`${country}||${b}`) ?? 0)
    );
    const group = document.createElement("div");
    group.className = "legend-group";
    group.innerHTML = `<span class="legend-country" style="color:${countryBase(country)}">${country}</span>` +
      places.map(p => `<span class="legend-item"><span class="legend-swatch" style="background:${colorForTown(country, p)}"></span>${p}</span>`).join("");
    legendEl.appendChild(group);
  }
  if (hasTransit) {
    const t = document.createElement("div");
    t.className = "legend-group";
    t.innerHTML = `<span class="legend-item"><span class="legend-swatch" style="background:${transitColor()}"></span>Transit</span>`;
    legendEl.appendChild(t);
  }
}

function renderCountryBarChart(countryCounts, total) {
  const entries = [...countryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const threshold = total * 0.02;
  const main = entries.filter(([, c]) => c >= threshold);
  const otherTotal = entries.filter(([, c]) => c < threshold).reduce((s, [, c]) => s + c, 0);
  const bars = main.map(([name, count]) => ({ name, count, color: countryBase(name) }));
  if (otherTotal > 0) bars.push({ name: "Other", count: otherTotal, color: otherBarColor() });

  const maxCount = Math.max(...bars.map(b => b.count), 1);
  countryBarChartEl.innerHTML = bars.length ? bars.map(b => `
    <div class="bar-row">
      <div class="bar-label">${b.name}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(b.count / maxCount * 100).toFixed(1)}%; background:${b.color}"></div></div>
      <div class="bar-value">${b.count}</div>
    </div>`).join("") : `<div class="empty-note">No data yet.</div>`;
}

function rankTable(tbodyEl, rows) {
  tbodyEl.innerHTML = "";
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="rank">${i + 1}</td>
      <td class="name-cell"><span class="legend-swatch" style="background:${row.color}"></span>${row.label}</td>
      <td class="num">${row.count}</td>
      <td class="num">${row.pct}%</td>`;
    tbodyEl.appendChild(tr);
  });
  if (rows.length === 0) {
    tbodyEl.innerHTML = `<tr><td colspan="4" class="empty-note">No data yet.</td></tr>`;
  }
}

function renderTables(scopedRecords) {
  const countryCounts = new Map();
  const townCounts = new Map(); // "country||place" -> {country, place, count}
  for (const r of scopedRecords) {
    countryCounts.set(r.country, (countryCounts.get(r.country) || 0) + 1);
    if (r.type === "stay") {
      const key = `${r.country}||${r.place}`;
      const entry = townCounts.get(key) || { country: r.country, place: r.place, count: 0 };
      entry.count++;
      townCounts.set(key, entry);
    }
  }

  const total = scopedRecords.length;
  const countryRows = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([country, count]) => ({
      label: country, count, color: countryBase(country),
      pct: total ? ((count / total) * 100).toFixed(1) : "0.0",
    }));
  rankTable(countriesTable, countryRows);
  renderCountryBarChart(countryCounts, total);

  const stayCount = scopedRecords.filter(r => r.type === "stay").length;
  const townRows = [...townCounts.values()]
    .sort((a, b) => b.count - a.count)
    .map(t => ({
      label: t.place, count: t.count, color: colorForTown(t.country, t.place),
      pct: stayCount ? ((t.count / stayCount) * 100).toFixed(1) : "0.0",
    }));
  rankTable(townsTable, townRows);
}

function renderSummary(scopedRecords) {
  const countries = new Set(scopedRecords.map(r => r.country)).size;
  const towns = new Set(scopedRecords.filter(r => r.type === "stay").map(r => `${r.country}||${r.place}`)).size;
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

  renderHeatmapSection();
  renderLegend(scopedRecords);
  renderSummary(scopedRecords);
  renderTables(scopedRecords);
}

scopeSelect.addEventListener("change", () => {
  if (scopeSelect.value === "lifetime") {
    state.scope = "lifetime";
  } else {
    state.scope = "year";
    state.year = Number(scopeSelect.value);
  }
  render();
});

if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (records.length || townRanks.size) render();
  });
}

(async function init() {
  try {
    statusEl.textContent = "Loading…";
    records = await fetchNights();
    townRanks = buildTownRanks(records);
    populateScopeSelect();
    statusEl.textContent = "";
    render();
  } catch (err) {
    statusEl.textContent = `Couldn't load data: ${err.message}`;
  }
})();
