// One-time / occasional bulk import of historical nights data.
// Usage:
//   GIST_TOKEN=<a token with only the 'gist' scope> node scripts/import-backfill.js records.json
// records.json: a JSON array of { date: "YYYY-MM-DD", type: "stay"|"transit", country, place }
// Entries are merged by date — an incoming record replaces any existing one for the same date.
import fs from "node:fs";

const GIST_ID = "9286341881cfd023e7ec21b7a821471d";
const token = process.env.GIST_TOKEN;
const file = process.argv[2];

if (!token) { console.error("Set GIST_TOKEN env var (a token with only the 'gist' scope)."); process.exit(1); }
if (!file) { console.error("Usage: GIST_TOKEN=... node scripts/import-backfill.js records.json"); process.exit(1); }

const incoming = JSON.parse(fs.readFileSync(file, "utf8"));

const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
const gist = await res.json();
const existing = JSON.parse(gist.files["nights.json"]?.content || "[]");

const byDate = new Map(existing.map(r => [r.date, r]));
for (const r of incoming) byDate.set(r.date, r);
const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

const patchRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  body: JSON.stringify({ files: { "nights.json": { content: JSON.stringify(merged, null, 2) } } }),
});
if (!patchRes.ok) throw new Error(`Save failed: HTTP ${patchRes.status}`);

console.log(`Imported ${incoming.length} records. Gist now has ${merged.length} total.`);
