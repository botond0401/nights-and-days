// Run by .github/workflows/auto-location-notify.yml shortly after the phone's
// daily capture. Checks whether today got an auto-saved entry (source: "auto")
// and, if so, emits a message for the notification email.
import fs from "node:fs";

const GIST_ID = process.env.GIST_ID;
// Fixed CEST offset (UTC+2), matching the other workflows' convention — drifts
// by an hour once CET (winter) kicks in; same caveat as daily-reminder.yml.
const LOCAL_UTC_OFFSET_HOURS = 2;

function todayLocalDateString() {
  const d = new Date(Date.now() + LOCAL_UTC_OFFSET_HOURS * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch gist: HTTP ${res.status}`);
  const gist = await res.json();
  const records = JSON.parse(gist.files["nights.json"]?.content || "[]");

  const today = todayLocalDateString();
  const rec = records.find(r => r.date === today);

  if (rec && rec.source === "auto") {
    const desc = `${rec.place}, ${rec.country}`;
    const message = `Saw you at ${desc} and saved it for ${today}. `
      + `Wrong? Fix it here: https://botond0401.github.io/nights-and-days/log/?date=${today}`;
    console.log(message);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `found=true\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `message=${message}\n`);
  } else {
    console.log("No auto-saved entry for today.");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `found=false\n`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
