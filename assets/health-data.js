const WORKER_ORIGIN = "https://aged-bonus-91cf.botond-kov0401.workers.dev";

export function getPassphrase() {
  let pass = sessionStorage.getItem("health_passphrase") || localStorage.getItem("health_passphrase");
  if (!pass) {
    pass = prompt("Passphrase:") || "";
    const remember = pass && confirm("Remember on this device? (OK = yes, Cancel = just this session)");
    if (remember) localStorage.setItem("health_passphrase", pass);
    else sessionStorage.setItem("health_passphrase", pass);
  }
  return pass;
}

export function forgetPassphrase() {
  sessionStorage.removeItem("health_passphrase");
  localStorage.removeItem("health_passphrase");
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
