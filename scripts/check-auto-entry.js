// Run by .github/workflows/auto-location-notify.yml after the phone's daily
// capture. GitHub Actions' cron is "best effort" and has been observed firing
// hours late here — late enough to roll past local midnight, which would make
// a single-day date check silently miss yesterday's real capture. So instead
// of checking only "today," this looks back over the last 2 calendar days for
// any unreported auto-saved entry.
import fs from "node:fs";

const GIST_ID = process.env.GIST_ID;
// Fixed CEST offset (UTC+2) — drifts by an hour once CET (winter) kicks in,
// same caveat as the other workflows. Only used to pick the lookback window,
// so being off by an hour doesn't matter much here.
const LOCAL_UTC_OFFSET_HOURS = 2;

function localDateString(msAgo = 0) {
  const d = new Date(Date.now() - msAgo + LOCAL_UTC_OFFSET_HOURS * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch gist: HTTP ${res.status}`);
  const gist = await res.json();
  const records = JSON.parse(gist.files["nights.json"]?.content || "[]");

  const lookbackDates = [localDateString(0), localDateString(24 * 3600 * 1000)]; // today, yesterday
  const found = records.filter(r => r.source === "auto" && lookbackDates.includes(r.date));

  if (found.length === 0) {
    console.log(`No auto-saved entries for ${lookbackDates.join(" or ")}.`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `found=false\n`);
    return;
  }

  const lines = found
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => `${r.date}: ${r.place}, ${r.country} — fix it here: https://botond0401.github.io/nights-and-days/log/?date=${r.date}`);
  const message = `Saw you at these — correct any that are wrong:\n${lines.join("\n")}`;
  console.log(message);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `found=true\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `message<<EOF_MESSAGE\n${message}\nEOF_MESSAGE\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
