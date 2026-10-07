// Run by .github/workflows/monthly-missed-check.yml on the 1st of each month.
// Checks the month that just ended for dates with no entry in the gist.
import fs from "node:fs";

const GIST_ID = process.env.GIST_ID;

async function main() {
  // Authenticated so this runs against GitHub's 5000/hr rate limit instead of
  // the 60/hr anonymous one — Actions runners share IP pools and can hit that.
  const headers = process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {};
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { cache: "no-store", headers });
  if (!res.ok) throw new Error(`Failed to fetch gist: HTTP ${res.status}`);
  const gist = await res.json();
  const records = JSON.parse(gist.files["nights.json"]?.content || "[]");
  const known = new Set(records.map(r => r.date));

  const now = new Date();
  const isJanuary = now.getUTCMonth() === 0;
  const year = isJanuary ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = isJanuary ? 11 : now.getUTCMonth() - 1; // 0-indexed, previous month

  const dataStart = new Date(Date.UTC(2024, 0, 1));
  const monthStart = new Date(Date.UTC(year, month, 1));
  if (monthStart < dataStart) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_missing=false\n`);
    return;
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const missing = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!known.has(dateStr)) missing.push(dateStr);
  }

  if (missing.length === 0) {
    console.log("No missing nights last month.");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_missing=false\n`);
  } else {
    console.log(`Missing: ${missing.join(", ")}`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_missing=true\n`);
    const body = `You didn't log these nights: ${missing.join(", ")}. `
      + `Fill them in here: https://botond0401.github.io/nights-and-days/log/`;
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `missing_list=${body}\n`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
