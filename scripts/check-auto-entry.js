// Run by .github/workflows/auto-location-notify.yml after the phone's daily
// capture. GitHub Actions' cron is "best effort" and has been observed firing
// hours late here — late enough to roll past local midnight, which would make
// a single-day date check silently miss yesterday's real capture. So instead
// of checking only "today," this looks back over the last 2 calendar days for
// any unreported auto-saved entry.
//
// It also separately checks the last week for nights with NO entry at all
// (neither auto-captured nor manually logged) — e.g. if the phone automation
// silently stops working — and asks to log those manually.
import fs from "node:fs";

const GIST_ID = process.env.GIST_ID;
// Fixed CEST offset (UTC+2) — drifts by an hour once CET (winter) kicks in,
// same caveat as the other workflows. Only used to pick date windows, so
// being off by an hour doesn't matter much here.
const LOCAL_UTC_OFFSET_HOURS = 2;
const GAP_CHECK_DAYS = 7;

function localDateString(msAgo = 0) {
  const d = new Date(Date.now() - msAgo + LOCAL_UTC_OFFSET_HOURS * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch gist: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  const gist = await res.json();
  const records = JSON.parse(gist.files["nights.json"]?.content || "[]");
  const knownDates = new Set(records.map(r => r.date));

  const blocks = [];

  // 1) Newly auto-captured nights (today or yesterday) not yet reported.
  const autoLookback = [localDateString(0), localDateString(24 * 3600 * 1000)];
  const autoFound = records.filter(r => r.source === "auto" && autoLookback.includes(r.date));
  for (const r of autoFound.sort((a, b) => a.date.localeCompare(b.date))) {
    blocks.push(
      `Hello there, your night for ${r.date} was logged in ${r.place}, ${r.country}.\n`
      + `If incorrect, fix it here: https://botond0401.github.io/nights-and-days/log/?date=${r.date}`
    );
  }

  // 2) Gap nights in the last week with no entry at all (auto capture may
  // have silently stopped working) — excludes today, which isn't over yet.
  const gapDates = [];
  for (let i = 1; i <= GAP_CHECK_DAYS; i++) {
    const d = localDateString(i * 24 * 3600 * 1000);
    if (!knownDates.has(d)) gapDates.push(d);
  }
  if (gapDates.length > 0) {
    const links = gapDates.sort().map(d => `https://botond0401.github.io/nights-and-days/log/?date=${d}`);
    blocks.push(
      `You haven't logged these nights at all: ${gapDates.join(", ")}.\n`
      + `Log them manually here:\n${links.join("\n")}`
    );
  }

  if (blocks.length === 0) {
    console.log("Nothing to report.");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `found=false\n`);
    return;
  }

  const message = blocks.join("\n\n");
  console.log(message);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `found=true\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `message<<EOF_MESSAGE\n${message}\nEOF_MESSAGE\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
