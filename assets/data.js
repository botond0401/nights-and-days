export const GIST_ID = "9286341881cfd023e7ec21b7a821471d";

export async function fetchNights() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load data (HTTP ${res.status})`);
  const gist = await res.json();
  const file = gist.files["nights.json"];
  if (!file) return [];
  const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
  const records = JSON.parse(content || "[]");
  return records.sort((a, b) => a.date.localeCompare(b.date));
}
