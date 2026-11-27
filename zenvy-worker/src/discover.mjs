// Zenvy discovery dry-run — no spending, no login, no submission.
// Reads public sources only. Writes data/opportunities.json.
// Run: node src/discover.mjs
// Verified endpoints (2026-11-27, checked live):
// - make.fun public competition detail: https://make.fun/api/competitions/<slug>
//   (base from ~/workspace/makefun/mfapi.py: 'https://make.fun/api' + path.
//   The old guess https://api.make.fun/api/competitions timed out — wrong host.)
//   Public detail needs NO API key. Account actions (submit/status) DO need
//   the x-api-key from ~/.makefun/credentials — never read or embed it here.
// - Superteam Earn: only the public HTML page https://earn.superteam.fun/
//   is verified. No public JSON listings API was found — do not invent one.
// - GitHub: https://api.github.com/search/issues?q=label:bounty+state:open
import { writeFile, mkdir, readFile } from "node:fs/promises";

// Preserve prior run data (broad sweeps, verified samples) — merge, never wipe.
// Bug found 2026-11-27 07:41 WIB: plain writeFile destroyed the broad_sweep
// section every run. Now: read existing file first, keep its extra keys.
let prev = {};
try {
  prev = JSON.parse(await readFile(new URL("../data/opportunities.json", import.meta.url), "utf8"));
} catch {
  prev = {};
}

const out = {
  ...prev,
  generated_at: new Date().toISOString(),
  mode: "dry-run",
  spent_usd: 0,
  submitted: 0,
  sources: [],
};

async function getJson(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "zenvy-earning-worker-dry-run/0.2", Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, data: await res.json() };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(t);
  }
}

async function getText(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "zenvy-earning-worker-dry-run/0.2", Accept: "text/html" },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, bytes: text.length, text };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(t);
  }
}

// 1. make.fun — verified public endpoint, no key needed for competition detail.
// Known competition slug from prior work: news-image-20261126 ($100, closed 28 Nov 2026).
const makefun = await getJson("https://make.fun/api/competitions/news-image-20261126");
out.sources.push({
  name: "make.fun",
  endpoint: "https://make.fun/api/competitions/<slug>",
  account: "@zenvy-ch",
  note: "Public competition detail needs no API key. Account actions (submit, entry status) need the make.fun API key (valid until 19 Dec 2026) and user approval per competition — not used in dry-run. Entries already submitted under @zenvy-ch stay as-is.",
  result: makefun.ok
    ? {
        reachable: true,
        endpoint_verified: true,
        slug: makefun.data?.slug ?? null,
        title: makefun.data?.title ?? null,
        reward_usd: makefun.data?.rewardAmount ?? null,
        deadline: makefun.data?.deadline ?? null,
        submission_count: makefun.data?.submissionCount ?? null,
      }
    : { reachable: false, endpoint_verified: false, status: makefun.status ?? null, error: makefun.error ?? null },
});

// 2. GitHub public bounty search — no auth, public API only
const gh = await getJson(
  "https://api.github.com/search/issues?q=label:bounty+state:open&per_page=5"
);
out.sources.push({
  name: "github-bounties",
  endpoint: "https://api.github.com/search/issues?q=label:bounty+state:open",
  note: "Public issues labelled bounty. Real payout must be verified per issue (sponsor, amount, payment record) before any work.",
  result: gh.ok
    ? { reachable: true, endpoint_verified: true, total_count: gh.data?.total_count ?? 0 }
    : { reachable: false, endpoint_verified: false, status: gh.status ?? null, error: gh.error ?? null },
});

// 3. Superteam Earn — verified public HTML page only, no JSON API invented.
const st = await getText("https://earn.superteam.fun/");
out.sources.push({
  name: "superteam-earn",
  endpoint: "https://earn.superteam.fun/ (HTML page only)",
  note: "Listings page is public HTML (bounties + freelance gigs, Solana). No verified public JSON listings API — a dedicated adapter must verify an endpoint and KYC/eligibility per bounty before work. Not auto-claimed.",
  result: st.ok
    ? {
        reachable: true,
        endpoint_verified: true,
        page_bytes: st.bytes,
        mentions_bounties: /bount/i.test(st.text || ""),
        json_api_verified: false,
      }
    : { reachable: false, endpoint_verified: false, status: st.status ?? null, error: st.error ?? null, json_api_verified: false },
});

// 4. Moltlaunch / CashClaw upstream
out.sources.push({
  name: "moltlaunch-cashclaw",
  endpoint: "moltlaunch API (via mltl CLI) — not used in dry-run",
  note: "Upstream CashClaw is Base-only, needs the mltl CLI + an LLM API key + a spending wallet for AgentCash. None of those are enabled in dry-run. Integration status: not enabled.",
  result: { reachable: "not_enabled_in_dry_run", endpoint_verified: false },
});

await mkdir(new URL("../data", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/opportunities.json", import.meta.url),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
process.exit(0);
