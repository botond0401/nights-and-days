// Cloudflare Worker: proxies writes from the public /log/ page (and the daily
// auto-location capture) to the private nights.json Gist, plus reads/writes
// for the separate, passphrase-gated health tracker.
//
// Deploy via the Cloudflare dashboard (Workers & Pages -> Create -> paste this
// in "Quick edit" -> Deploy), then set these under Settings -> Variables:
//   GIST_ID            = the nights.json gist id (not secret)
//   HEALTH_GIST_ID      = the health.json gist id (not secret)
//   GIST_TOKEN          = a GitHub classic PAT scoped to ONLY "gist" (secret;
//                         one token covers all your gists, including both above)
//   APP_SECRET          = a random string shared with log/app.js and the phone
//                         automation (secret) — protects the nights routes
//   HEALTH_PASSPHRASE    = a passphrase ONLY you know, never put in any public
//                         file — typed into the health pages each session
//                         (secret) — protects the health routes
//
// Routes:
//   POST /          { date, type, country, place }  — manual night save, needs X-App-Secret
//   POST /location  { date, lat, lon }               — phone auto-capture, needs X-App-Secret
//   GET  /health/data                                — read all health entries, needs X-Health-Passphrase
//   POST /health/log  { ...entry }                   — add a health entry, needs X-Health-Passphrase

const NIGHTS_CORS = {
  "Access-Control-Allow-Origin": "https://botond0401.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Secret",
};
const HEALTH_CORS = {
  "Access-Control-Allow-Origin": "https://botond0401.github.io",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Health-Passphrase",
};

function ghHeaders(env) {
  return { Authorization: `Bearer ${env.GIST_TOKEN}`, "User-Agent": "nights-and-days-worker" };
}

async function readGistFile(env, gistId, filename) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: ghHeaders(env) });
  if (!res.ok) throw new Error(`Failed to read gist: ${res.status}`);
  const gist = await res.json();
  return JSON.parse(gist.files[filename]?.content || "[]");
}

async function writeGistFile(env, gistId, filename, records) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ files: { [filename]: { content: JSON.stringify(records, null, 2) } } }),
  });
  if (!res.ok) throw new Error(`Failed to save: ${res.status}`);
}

async function handleNights(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { headers: NIGHTS_CORS });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: NIGHTS_CORS });
  if (request.headers.get("X-App-Secret") !== env.APP_SECRET) {
    return new Response("Forbidden", { status: 403, headers: NIGHTS_CORS });
  }

  try {
    if (url.pathname === "/location") {
      const body = await request.json().catch(() => null);
      if (!body || !body.date || body.lat == null || body.lon == null) {
        return new Response("Missing fields", { status: 400, headers: NIGHTS_CORS });
      }
      const date = String(body.date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response("Bad date format", { status: 400, headers: NIGHTS_CORS });
      }

      const existing = await readGistFile(env, env.GIST_ID, "nights.json");
      if (existing.some(r => r.date === date)) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already logged" }), {
          headers: { ...NIGHTS_CORS, "Content-Type": "application/json" },
        });
      }

      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${body.lat}&lon=${body.lon}&format=json&zoom=14&addressdetails=1`,
        { headers: { "User-Agent": "nights-and-days-auto-capture (personal use)" } }
      );
      if (!geoRes.ok) {
        return new Response(`Reverse geocoding failed: ${geoRes.status}`, { status: 502, headers: NIGHTS_CORS });
      }
      const geo = await geoRes.json();
      const addr = geo.address || {};
      const cc = (addr.country_code || "").toUpperCase();
      let country = addr.country;
      if (cc === "GB" && addr.state) {
        country = addr.state;
      } else if (cc) {
        try {
          country = new Intl.DisplayNames(["en"], { type: "region" }).of(cc) || addr.country;
        } catch {
          // fall back to Nominatim's own text
        }
      }
      const place = addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.suburb;
      if (!country || !place) {
        return new Response("Could not resolve a town/country for that location", { status: 422, headers: NIGHTS_CORS });
      }

      const record = { date, type: "stay", country, place, source: "auto" };
      await writeGistFile(env, env.GIST_ID, "nights.json", [...existing, record].sort((a, b) => a.date.localeCompare(b.date)));
      return new Response(JSON.stringify({ ok: true, country, place }), {
        headers: { ...NIGHTS_CORS, "Content-Type": "application/json" },
      });
    }

    // Default route: manual save from the /log/ page.
    const record = await request.json().catch(() => null);
    if (!record || !record.date || !record.type || !record.country || !record.place) {
      return new Response("Missing fields", { status: 400, headers: NIGHTS_CORS });
    }
    const existing = await readGistFile(env, env.GIST_ID, "nights.json");
    const updated = [...existing.filter(r => r.date !== record.date), record]
      .sort((a, b) => a.date.localeCompare(b.date));
    await writeGistFile(env, env.GIST_ID, "nights.json", updated);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...NIGHTS_CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(String(err.message || err), { status: 502, headers: NIGHTS_CORS });
  }
}

async function handleHealth(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { headers: HEALTH_CORS });
  if (request.headers.get("X-Health-Passphrase") !== env.HEALTH_PASSPHRASE) {
    return new Response("Forbidden", { status: 403, headers: HEALTH_CORS });
  }

  try {
    if (url.pathname === "/health/data" && request.method === "GET") {
      const entries = await readGistFile(env, env.HEALTH_GIST_ID, "health.json");
      return new Response(JSON.stringify(entries), {
        headers: { ...HEALTH_CORS, "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/health/log" && request.method === "POST") {
      const entry = await request.json().catch(() => null);
      if (!entry || !entry.date || !entry.time || !entry.type) {
        return new Response("Missing fields", { status: 400, headers: HEALTH_CORS });
      }
      entry.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const existing = await readGistFile(env, env.HEALTH_GIST_ID, "health.json");
      const updated = [...existing, entry].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      await writeGistFile(env, env.HEALTH_GIST_ID, "health.json", updated);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...HEALTH_CORS, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: HEALTH_CORS });
  } catch (err) {
    return new Response(String(err.message || err), { status: 502, headers: HEALTH_CORS });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/health/")) return handleHealth(request, env, url);
    return handleNights(request, env, url);
  },
};
