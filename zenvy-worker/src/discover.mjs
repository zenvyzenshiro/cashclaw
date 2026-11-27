// Zenvy discovery dry-run — no spending, no login, no submission.
// Reads public sources only. Writes data/opportunities.json.
// Run: node src/discover.mjs
import { writeFile, mkdir } from "node:fs/promises";

const out = {
  generated_at: new Date().toISOString(),
  mode: "dry-run",
  spent_usd: 0,
  submitted: 0,
  sources: [],
};

async function getJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "zenvy-earning-worker-dry-run/0.1" },
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(t);
  }
}

// 1. make.fun — public competitions list (no auth for the public index)
const makefun = await getJson("https://api.make.fun/api/competitions?limit=20");
out.sources.push({
  name: "make.fun",
  account: "@zenvy-ch",
  note: "Entries already submitted under @zenvy-ch stay as-is. New submissions need the make.fun login/API key, which is valid until 19 Dec 2026, and user approval per competition.",
  result: makefun.ok
    ? { reachable: true, count: Array.isArray(makefun.data) ? makefun.data.length : (makefun.data?.competitions?.length ?? 0) }
    : { reachable: false, status: makefun.status ?? null, error: makefun.error ?? null },
});

// 2. GitHub public bounty search — no auth, public API only
const gh = await getJson(
  "https://api.github.com/search/issues?q=label:bounty+state:open&per_page=5"
);
out.sources.push({
  name: "github-bounties",
  note: "Public issues labelled bounty. Real payout must be verified per issue (sponsor, amount, payment record) before any work.",
  result: gh.ok
    ? { reachable: true, total_count: gh.data?.total_count ?? 0 }
    : { reachable: false, status: gh.status ?? null, error: gh.error ?? null },
});

// 3. Superteam Earn — public listings page check (no auth)
out.sources.push({
  name: "superteam-earn",
  note: "Listings are public at earn.superteam.fun. No public JSON API used here; a dedicated adapter needs a verified endpoint and KYC/eligibility check per bounty before work. Not auto-claimed.",
  result: { reachable: "not_checked_in_dry_run", reason: "no verified public JSON endpoint yet" },
});

// 4. Moltlaunch / CashClaw upstream
out.sources.push({
  name: "moltlaunch-cashclaw",
  note: "Upstream CashClaw is Base-only, needs the mltl CLI + an LLM API key + a spending wallet for AgentCash. None of those are enabled in dry-run. Integration status: not enabled.",
  result: { reachable: "not_enabled_in_dry_run" },
});

await mkdir(new URL("../data", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/opportunities.json", import.meta.url),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
