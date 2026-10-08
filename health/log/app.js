import { fetchHealthEntries, saveHealthEntry } from "../../assets/health-data.js";

const sessionListEl = document.getElementById("session-list");
const formAreaEl = document.getElementById("form-area");
const skinBtn = document.getElementById("skin-btn");
const dateInput = document.getElementById("date-input");

let allEntries = [];
let sessionLogged = []; // entries added this page view, for whatever date was selected when saved

function todayLocalDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function nowLocalTime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(11, 16);
}
function selectedDate() { return dateInput.value; }

const dateParam = new URLSearchParams(location.search).get("date");
dateInput.value = (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) ? dateParam : todayLocalDate();

function previousValues(type, field) {
  const counts = new Map();
  for (const e of allEntries) {
    if (e.type !== type || !e[field]) continue;
    counts.set(e[field], (counts.get(e[field]) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 6);
}

function renderSessionList() {
  const date = selectedDate();
  const dayEntries = [
    ...allEntries.filter(e => e.date === date),
    ...sessionLogged.filter(e => e.date === date),
  ];
  if (dayEntries.length === 0) {
    sessionListEl.innerHTML = `<div class="empty-note">Nothing logged for ${date} yet.</div>`;
    return;
  }
  sessionListEl.innerHTML = dayEntries
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(e => `<div class="session-item"><span><span class="time">${e.time}</span>${describe(e)}</span></div>`)
    .join("");
}

function describe(e) {
  if (e.type === "food") return `🍽 ${e.mealType ? `${e.mealType}: ` : ""}${e.food}`;
  if (e.type === "stomach") return `🤢 ${e.symptom}${e.severity ? ` (${e.severity})` : ""}`;
  if (e.type === "toilet") return `🚽 ${e.duration}`;
  if (e.type === "skin") {
    const base = e.locations.length ? `🧴 ${e.locations.join(", ")}` : `🧴 clear`;
    return e.note ? `${base} — ${e.note}` : base;
  }
  return e.type;
}

function updateSkinButton() {
  const date = selectedDate();
  const alreadyLogged = allEntries.some(e => e.type === "skin" && e.date === date)
    || sessionLogged.some(e => e.type === "skin" && e.date === date);
  skinBtn.disabled = alreadyLogged;
}

function closeForm() { formAreaEl.innerHTML = ""; }

async function submitEntry(entry) {
  formAreaEl.innerHTML = `<div class="form-card">Saving…</div>`;
  try {
    await saveHealthEntry(entry);
    sessionLogged.push(entry);
    renderSessionList();
    updateSkinButton();
    closeForm();
  } catch (err) {
    formAreaEl.innerHTML = `<div class="form-card error-box">${err.message}</div>`;
  }
}

function chipGrid(id, options, { allowOther = true } = {}) {
  return `
    <div class="chip-grid" id="${id}">
      ${options.map(o => `<button type="button" class="chip" data-value="${o}">${o}</button>`).join("")}
      ${allowOther ? `<button type="button" class="chip" data-value="__other__">Other…</button>` : ""}
    </div>`;
}

function wireChipGrid(id, { multi = false } = {}) {
  const grid = document.getElementById(id);
  grid.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    if (!multi) grid.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
    chip.classList.toggle("selected");
  });
  return grid;
}

function selectedChipValues(grid) {
  return [...grid.querySelectorAll(".chip.selected")].map(c => c.dataset.value);
}

function renderFoodForm() {
  const suggestions = previousValues("food", "food");
  const mealTypes = ["Breakfast", "Morning snack", "Lunch", "Afternoon snack", "Dinner"];
  formAreaEl.innerHTML = `
    <div class="form-card">
      <div class="field-row"><label>Time</label><input type="time" id="f-time" value="${nowLocalTime()}"></div>
      <div class="field-row"><label>Meal</label>
        ${chipGrid("f-meal-type", mealTypes, { allowOther: false })}
      </div>
      <div class="field-row"><label>What did you eat?</label>
        <input type="text" id="f-food" placeholder="e.g. Chicken salad">
        ${suggestions.length ? chipGrid("f-suggestions", suggestions, { allowOther: false }) : ""}
      </div>
      <div class="form-actions">
        <button class="choice" id="f-save">Save</button>
        <button class="choice secondary" id="f-cancel">Cancel</button>
      </div>
    </div>`;
  const mealTypeGrid = wireChipGrid("f-meal-type");
  if (suggestions.length) {
    wireChipGrid("f-suggestions").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (chip) document.getElementById("f-food").value = chip.dataset.value;
    });
  }
  document.getElementById("f-cancel").onclick = closeForm;
  document.getElementById("f-save").onclick = () => {
    const food = document.getElementById("f-food").value.trim();
    if (!food) return;
    const mealType = selectedChipValues(mealTypeGrid)[0] || "";
    submitEntry({ date: selectedDate(), time: document.getElementById("f-time").value, type: "food", food, mealType });
  };
}

function renderStomachForm() {
  const commonSymptoms = ["Bloating", "Pain", "Nausea", "Diarrhea", "Cramping", "Gas"];
  formAreaEl.innerHTML = `
    <div class="form-card">
      <div class="field-row"><label>Time</label><input type="time" id="s-time" value="${nowLocalTime()}"></div>
      <div class="field-row"><label>Symptom</label>
        ${chipGrid("s-symptom", commonSymptoms)}
        <input type="text" id="s-symptom-other" placeholder="Describe it…" style="display:none; margin-top:8px;">
      </div>
      <div class="field-row"><label>Severity</label>
        ${chipGrid("s-severity", ["Mild", "Moderate", "Severe"], { allowOther: false })}
      </div>
      <div class="form-actions">
        <button class="choice" id="s-save">Save</button>
        <button class="choice secondary" id="s-cancel">Cancel</button>
      </div>
    </div>`;
  const symptomGrid = wireChipGrid("s-symptom");
  symptomGrid.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.getElementById("s-symptom-other").style.display = chip.dataset.value === "__other__" ? "block" : "none";
  });
  wireChipGrid("s-severity");
  document.getElementById("s-cancel").onclick = closeForm;
  document.getElementById("s-save").onclick = () => {
    const picked = selectedChipValues(symptomGrid)[0];
    const symptom = picked === "__other__" ? document.getElementById("s-symptom-other").value.trim() : picked;
    if (!symptom) return;
    const severity = selectedChipValues(document.getElementById("s-severity"))[0] || "";
    submitEntry({ date: selectedDate(), time: document.getElementById("s-time").value, type: "stomach", symptom, severity });
  };
}

function renderToiletForm() {
  formAreaEl.innerHTML = `
    <div class="form-card">
      <div class="field-row"><label>Time</label><input type="time" id="t-time" value="${nowLocalTime()}"></div>
      <div class="field-row"><label>Duration</label>
        ${chipGrid("t-duration", ["Short", "Long"], { allowOther: false })}
      </div>
      <div class="form-actions">
        <button class="choice" id="t-save">Save</button>
        <button class="choice secondary" id="t-cancel">Cancel</button>
      </div>
    </div>`;
  const durationGrid = wireChipGrid("t-duration");
  document.getElementById("t-cancel").onclick = closeForm;
  document.getElementById("t-save").onclick = () => {
    const duration = selectedChipValues(durationGrid)[0];
    if (!duration) return;
    submitEntry({ date: selectedDate(), time: document.getElementById("t-time").value, type: "toilet", duration });
  };
}

function renderSkinForm() {
  const locations = ["Face", "Chest", "Back", "Shoulders", "Arms"];
  formAreaEl.innerHTML = `
    <div class="form-card">
      <p class="question" style="margin-top:0;">Any pimples that day?</p>
      <div class="chip-grid" id="skin-yn">
        <button type="button" class="chip" data-value="no">No</button>
        <button type="button" class="chip" data-value="yes">Yes</button>
      </div>
      <div id="skin-locations-row" style="display:none; margin-top:14px;">
        <div class="field-row"><label>Where?</label>
          ${chipGrid("skin-locations", locations)}
          <input type="text" id="skin-other" placeholder="Other location…" style="display:none; margin-top:8px;">
        </div>
      </div>
      <div class="field-row" style="margin-top:14px;"><label>Note (optional)</label>
        <input type="text" id="skin-note" placeholder="Anything worth noting…">
      </div>
      <div class="form-actions">
        <button class="choice" id="skin-save">Save</button>
        <button class="choice secondary" id="skin-cancel">Cancel</button>
      </div>
    </div>`;
  const ynGrid = wireChipGrid("skin-yn");
  ynGrid.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.getElementById("skin-locations-row").style.display = chip.dataset.value === "yes" ? "block" : "none";
  });
  const locGrid = wireChipGrid("skin-locations", { multi: true });
  locGrid.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.getElementById("skin-other").style.display = chip.dataset.value === "__other__" ? "block" : "none";
  });
  document.getElementById("skin-cancel").onclick = closeForm;
  document.getElementById("skin-save").onclick = () => {
    const yn = selectedChipValues(ynGrid)[0];
    if (!yn) return;
    let locationsSelected = [];
    if (yn === "yes") {
      locationsSelected = selectedChipValues(locGrid).filter(v => v !== "__other__");
      const other = document.getElementById("skin-other").value.trim();
      if (other) locationsSelected.push(other);
      if (locationsSelected.length === 0) return;
    }
    const note = document.getElementById("skin-note").value.trim();
    submitEntry({ date: selectedDate(), time: nowLocalTime(), type: "skin", locations: locationsSelected, note });
  };
}

document.querySelector(".add-grid").addEventListener("click", (e) => {
  const btn = e.target.closest(".add-btn");
  if (!btn || btn.disabled) return;
  const renderers = { food: renderFoodForm, stomach: renderStomachForm, toilet: renderToiletForm, skin: renderSkinForm };
  renderers[btn.dataset.type]();
});

dateInput.addEventListener("change", () => {
  closeForm();
  renderSessionList();
  updateSkinButton();
});

(async function init() {
  sessionListEl.innerHTML = `<div class="empty-note">Loading…</div>`;
  try {
    allEntries = await fetchHealthEntries();
    renderSessionList();
    updateSkinButton();
  } catch (err) {
    sessionListEl.innerHTML = `<div class="error-box">${err.message}</div>`;
  }
})();
