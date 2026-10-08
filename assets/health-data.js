const WORKER_ORIGIN = "https://aged-bonus-91cf.botond-kov0401.workers.dev";

// In-memory only (not localStorage/sessionStorage) — asked fresh on every
// page load, reused only for the rest of that same page view so a single
// visit doesn't prompt twice.
let cachedPassphrase = null;

export function getPassphrase() {
  if (!cachedPassphrase) cachedPassphrase = prompt("Passphrase:") || "";
  return cachedPassphrase;
}

export function forgetPassphrase() {
  cachedPassphrase = null;
}

export async function fetchHealthEntries() {
  const pass = getPassphrase();
  const res = await fetch(`${WORKER_ORIGIN}/health/data`, {
    headers: { "X-Health-Passphrase": pass },
    cache: "no-store",
  });
  if (res.status === 403) {
    forgetPassphrase();
    throw new Error("Wrong passphrase");
  }
  if (!res.ok) throw new Error(`Failed to load (HTTP ${res.status})`);
  const entries = await res.json();
  return entries.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export async function saveHealthEntry(entry) {
  const pass = getPassphrase();
  const res = await fetch(`${WORKER_ORIGIN}/health/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Health-Passphrase": pass },
    body: JSON.stringify(entry),
  });
  if (res.status === 403) {
    forgetPassphrase();
    throw new Error("Wrong passphrase");
  }
  if (!res.ok) throw new Error(`Couldn't save (HTTP ${res.status})`);
}
