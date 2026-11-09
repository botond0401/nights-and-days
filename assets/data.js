export const GIST_ID = "9286341881cfd023e7ec21b7a821471d";

// Raw file URL, not api.github.com: the API allows only 60 anonymous requests
// per hour per IP, shared by every device on the same connection, and was
// running out (HTTP 403). The ?t= param skips the raw URL's 5-minute CDN cache
// so a just-logged night shows up immediately.
export async function fetchNights() {
  const res = await fetch(
    `https://gist.githubusercontent.com/botond0401/${GIST_ID}/raw/nights.json?t=${Date.now()}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to load data (HTTP ${res.status})`);
  const records = JSON.parse(await res.text() || "[]");
  return records.sort((a, b) => a.date.localeCompare(b.date));
}
