import { GIST_ID } from "../assets/data.js";
import { COUNTRIES } from "../assets/countries.js";

// Writes go through a Cloudflare Worker proxy (cloudflare-worker/nights-log-proxy.js)
// so the real GitHub token stays server-side -- GitHub auto-revokes any GitHub
// token it detects committed to a public repo, so it can never live here.
const WORKER_URL = "https://aged-bonus-91cf.botond-kov0401.workers.dev/";
const APP_SECRET = "6b2ba7d84b35e8be5555ec93b178d1b78ee20809a1d9eaf1";

const TRANSIT_HINTS = ["train","plane","flight","bus","car","ferry","boat","coach","tram","ship","taxi"];

const dateInput = document.getElementById("date-input");
const stepEl = document.getElementById("step");

function todayLocalISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
dateInput.value = todayLocalISO();

let records = [];
let loaded = false;

async function loadRecords() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load existing data (HTTP ${res.status})`);
  const gist = await res.json();
  const file = gist.files["nights.json"];
  records = JSON.parse(file?.content || "[]");
  loaded = true;
}

async function saveRecord(record) {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Secret": APP_SECRET,
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(`Couldn't save (HTTP ${res.status}). Check the Worker proxy.`);
  records = [...records.filter(r => r.date !== record.date), record]
    .sort((a, b) => a.date.localeCompare(b.date));
}

function previousPlacesFor(country) {
  const seen = new Map(); // place -> {type, count}
  for (const r of records) {
    if (r.country !== country) continue;
    const entry = seen.get(r.place) || { type: r.type, count: 0 };
    entry.count++;
    seen.set(r.place, entry);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([place, info]) => ({ place, type: info.type }));
}

function guessType(placeText) {
  const lower = placeText.toLowerCase();
  return TRANSIT_HINTS.some(hint => lower.includes(hint)) ? "transit" : "stay";
}

function render(html) { stepEl.innerHTML = html; }

function renderZurich() {
  render(`
    <p class="question">Did you sleep in Zurich?</p>
    <div class="choice-grid">
      <button class="choice" id="yes-btn">Yes</button>
      <button class="choice secondary" id="no-btn">No</button>
    </div>
  `);
  document.getElementById("yes-btn").onclick = () =>
    finalize({ country: "Switzerland", place: "Zurich", type: "stay" });
  document.getElementById("no-btn").onclick = renderCountryPicker;
}

function renderCountryPicker() {
  render(`
    <div class="breadcrumb"><button id="back-btn">← back</button></div>
    <p class="question">Which country?</p>
    <div class="choice-grid" id="country-choices">
      <button class="choice" data-country="Switzerland">Switzerland</button>
      <button class="choice" data-country="Austria">Austria</button>
      <button class="choice" data-country="Hungary">Hungary</button>
      <button class="choice secondary" id="other-country-btn">Other…</button>
    </div>
    <div id="other-country-row"></div>
  `);
  document.getElementById("back-btn").onclick = renderZurich;
  document.getElementById("country-choices").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-country]");
    if (btn) renderPlacePicker(btn.dataset.country);
  });
  document.getElementById("other-country-btn").onclick = () => {
    document.getElementById("other-country-row").innerHTML = `
      <div class="text-input-row">
        <input list="country-list" id="country-text" placeholder="Type a country…" autofocus>
        <datalist id="country-list">
          ${COUNTRIES.map(c => `<option value="${c}">`).join("")}
        </datalist>
        <button class="choice" id="country-confirm">Next</button>
      </div>`;
    const go = () => {
      const val = document.getElementById("country-text").value.trim();
      if (val) renderPlacePicker(val);
    };
    document.getElementById("country-confirm").onclick = go;
    document.getElementById("country-text").addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  };
}

function renderPlacePicker(country) {
  const previous = previousPlacesFor(country).filter(p => p.type !== "transit");
  render(`
    <div class="breadcrumb"><button id="back-btn">← back</button></div>
    <p class="question">Place (town, or transport if on the road)?</p>
    <div class="choice-grid" id="place-choices">
      ${previous.map(p => `<button class="choice" data-place="${p.place}" data-type="${p.type}">${p.place}</button>`).join("")}
      <button class="choice secondary" id="other-place-btn">Other…</button>
    </div>
    <div id="other-place-row"></div>
  `);
  document.getElementById("back-btn").onclick = renderCountryPicker;
  document.getElementById("place-choices").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-place]");
    if (btn) finalize({ country, place: btn.dataset.place, type: btn.dataset.type });
  });
  document.getElementById("other-place-btn").onclick = () => {
    document.getElementById("other-place-row").innerHTML = `
      <div class="text-input-row">
        <input id="place-text" placeholder="Town name, or e.g. Train / Plane / Bus" autofocus>
        <button class="choice" id="place-confirm">Save</button>
      </div>`;
    const go = () => {
      const val = document.getElementById("place-text").value.trim();
      if (val) finalize({ country, place: val, type: guessType(val) });
    };
    document.getElementById("place-confirm").onclick = go;
    document.getElementById("place-text").addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  };
}

async function finalize(partial) {
  const record = { date: dateInput.value, ...partial };
  render(`<div class="confirm-box">Saving…</div>`);
  try {
    if (!loaded) await loadRecords();
    await saveRecord(record);
    const desc = record.type === "transit"
      ? `in transit (${record.place}), departed ${record.country}`
      : `${record.place}, ${record.country}`;
    render(`
      <div class="confirm-box">
        <div class="big">Saved ✓</div>
        <div>${record.date} — ${desc}</div>
      </div>
      <div class="choice-grid" style="justify-content:center; margin-top:16px;">
        <button class="choice" id="log-another">Log another night</button>
      </div>
    `);
    document.getElementById("log-another").onclick = () => {
      dateInput.value = todayLocalISO();
      renderZurich();
    };
  } catch (err) {
    render(`
      <div class="error-box">${err.message}</div>
      <div class="choice-grid" style="margin-top:12px;">
        <button class="choice" id="retry-btn">Try again</button>
      </div>
    `);
    document.getElementById("retry-btn").onclick = renderZurich;
  }
}

(async function init() {
  render(`<div class="confirm-box">Loading…</div>`);
  try {
    await loadRecords();
    renderZurich();
  } catch (err) {
    render(`<div class="error-box">${err.message}</div>`);
  }
})();
