// Cloudflare Worker: proxies writes from the public /log/ page to the private
// nights.json Gist. The real GitHub token (GIST_TOKEN) lives only as a Worker
// secret — it never appears in the public repo, so GitHub's push protection /
// auto-revocation (which killed our earlier client-side-token attempt) never
// sees it.
//
// Deploy via the Cloudflare dashboard (Workers & Pages -> Create -> paste this
// in "Quick edit" -> Deploy), then set these under Settings -> Variables:
//   GIST_ID     = the nights.json gist id (not secret)
//   GIST_TOKEN  = a GitHub classic PAT scoped to ONLY "gist" (mark as secret)
//   APP_SECRET  = a random string shared with log/app.js (mark as secret)

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

    let record;
    try {
      record = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }
    if (!record.date || !record.type || !record.country || !record.place) {
      return new Response("Missing fields", { status: 400, headers: corsHeaders });
    }

    const ghHeaders = {
      Authorization: `Bearer ${env.GIST_TOKEN}`,
      "User-Agent": "nights-and-days-worker",
    };

    const gistRes = await fetch(`https://api.github.com/gists/${env.GIST_ID}`, { headers: ghHeaders });
    if (!gistRes.ok) {
      return new Response(`Failed to read gist: ${gistRes.status}`, { status: 502, headers: corsHeaders });
    }
    const gist = await gistRes.json();
    const existing = JSON.parse(gist.files["nights.json"]?.content || "[]");
    const updated = [...existing.filter(r => r.date !== record.date), record]
      .sort((a, b) => a.date.localeCompare(b.date));

    const patchRes = await fetch(`https://api.github.com/gists/${env.GIST_ID}`, {
      method: "PATCH",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ files: { "nights.json": { content: JSON.stringify(updated, null, 2) } } }),
    });
    if (!patchRes.ok) {
      return new Response(`Failed to save: ${patchRes.status}`, { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
