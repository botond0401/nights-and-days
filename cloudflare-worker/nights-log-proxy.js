// Cloudflare Worker: proxies writes from the public /log/ page (and the daily
// auto-location capture) to the private nights.json Gist. The real GitHub
// token (GIST_TOKEN) lives only as a Worker secret — it never appears in the
// public repo, so GitHub's push protection / auto-revocation (which killed
// our earlier client-side-token attempt) never sees it.
//
// Deploy via the Cloudflare dashboard (Workers & Pages -> Create -> paste this
// in "Quick edit" -> Deploy), then set these under Settings -> Variables:
//   GIST_ID     = the nights.json gist id (not secret)
//   GIST_TOKEN  = a GitHub classic PAT scoped to ONLY "gist" (mark as secret)
//   APP_SECRET  = a random string shared with log/app.js and the phone
//                 automation (mark as secret)
//
// Two routes:
//   POST /          { date, type, country, place }        — manual save from /log/
//   POST /location  { date, lat, lon }                     — daily auto-capture from phone

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://botond0401.github.io",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Secret",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }
    if (request.headers.get("X-App-Secret") !== env.APP_SECRET) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const ghHeaders = {
      Authorization: `Bearer ${env.GIST_TOKEN}`,
      "User-Agent": "nights-and-days-worker",
    };

    async function readGist() {
      const res = await fetch(`https://api.github.com/gists/${env.GIST_ID}`, { headers: ghHeaders });
      if (!res.ok) throw new Error(`Failed to read gist: ${res.status}`);
      const gist = await res.json();
      return JSON.parse(gist.files["nights.json"]?.content || "[]");
    }

    async function writeGist(records) {
      const res = await fetch(`https://api.github.com/gists/${env.GIST_ID}`, {
        method: "PATCH",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ files: { "nights.json": { content: JSON.stringify(records, null, 2) } } }),
      });
      if (!res.ok) throw new Error(`Failed to save: ${res.status}`);
    }

    try {
      if (url.pathname === "/location") {
        const body = await request.json().catch(() => null);
        if (!body || !body.date || body.lat == null || body.lon == null) {
          return new Response("Missing fields", { status: 400, headers: corsHeaders });
        }
        // Accept any date string that STARTS with yyyy-MM-dd (e.g. a full
        // "yyyy-MM-dd HH:mm:ss" timestamp from the phone automation).
        const date = String(body.date).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return new Response("Bad date format", { status: 400, headers: corsHeaders });
        }

        const existing = await readGist();
        if (existing.some(r => r.date === date)) {
          return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already logged" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${body.lat}&lon=${body.lon}&format=json&zoom=14&addressdetails=1&accept-language=en`,
          { headers: { "User-Agent": "nights-and-days-auto-capture (personal use)" } }
        );
        if (!geoRes.ok) {
          return new Response(`Reverse geocoding failed: ${geoRes.status}`, { status: 502, headers: corsHeaders });
        }
        const geo = await geoRes.json();
        const addr = geo.address || {};
        // UK addresses: Nominatim's top-level "country" is "United Kingdom"; the
        // constituent country (England/Scotland/Wales/Northern Ireland) usually
        // lands in "state" — prefer that to match this site's own convention.
        const country = (addr.country_code === "gb" && addr.state) ? addr.state : addr.country;
        const place = addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.suburb;
        if (!country || !place) {
          return new Response("Could not resolve a town/country for that location", { status: 422, headers: corsHeaders });
        }

        const record = { date, type: "stay", country, place, source: "auto" };
        await writeGist([...existing, record].sort((a, b) => a.date.localeCompare(b.date)));
        return new Response(JSON.stringify({ ok: true, country, place }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Default route: manual save from the /log/ page.
      const record = await request.json().catch(() => null);
      if (!record || !record.date || !record.type || !record.country || !record.place) {
        return new Response("Missing fields", { status: 400, headers: corsHeaders });
      }
      const existing = await readGist();
      const updated = [...existing.filter(r => r.date !== record.date), record]
        .sort((a, b) => a.date.localeCompare(b.date));
      await writeGist(updated);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(String(err.message || err), { status: 502, headers: corsHeaders });
    }
  },
};
