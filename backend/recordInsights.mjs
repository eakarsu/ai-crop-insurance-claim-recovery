// Search/filter, CSV/JSON export and deterministic record insights.
// No provider calls: insights always use the labelled deterministic fallback.
export function filterRecords(rows, { q = "", status = "", risk = "" } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  return (rows || []).filter((row) => {
    if (status && row.status !== status) return false;
    if (risk && row.risk !== risk) return false;
    if (!needle) return true;
    const hay = [row.reference, row.title, row.owner, row.status, row.risk, row.feature_id, JSON.stringify(row.payload ?? {})].join(" ").toLowerCase();
    return hay.includes(needle);
  });
}
function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value); // preserves false -> "false", 0 -> "0", "" -> ""
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export const EXPORT_COLUMNS = ["id", "reference", "title", "status", "owner", "risk", "due_date", "amount", "feature_id", "payload"];
export function recordsToCsv(rows) {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const row of rows || []) lines.push(EXPORT_COLUMNS.map((c) => csvCell(c === "due_date" ? String(row.due_date ?? "").slice(0, 10) : row[c])).join(","));
  return lines.join("\n") + "\n";
}
export function recordsToJson(rows) { return JSON.stringify(rows ?? [], null, 2); }

const RISK_W = { Critical: 4, High: 3, Moderate: 2, Low: 1 };
export function buildRecordInsights(records, feature, kind = "summarize") {
  const rows = records || [];
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const open = rows.filter((r) => !["Approved", "Closed"].includes(r.status));
  const highRisk = rows.filter((r) => ["High", "Critical"].includes(r.risk));
  const byStatus = {}; for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  const label = "Deterministic fallback (no AI provider called)";
  const base = { aiGenerated: false, generatedBy: "deterministic-fallback", label, kind, featureId: feature.id, featureTitle: feature.title, recordCount: rows.length, disclaimer: "Deterministic summary over your own saved records. Not tax or professional advice; validate source evidence before acting." };
  if (kind === "prioritize") {
    const ranked = [...rows].sort((a, b) => ((RISK_W[b.risk] || 0) - (RISK_W[a.risk] || 0)) || ((Number(b.amount) || 0) - (Number(a.amount) || 0))).slice(0, 5);
    return { ...base, headline: `${feature.title} — recovery prioritization`, metrics: [{ label: "Records reviewed", value: rows.length }, { label: "Open records", value: open.length }, { label: "High-risk records", value: highRisk.length }, { label: "Total value", value: total }], sections: [
      { title: "Priority queue (labelled)", detail: ranked.length ? ranked.map((r, i) => `${i + 1}. ${r.reference} — ${r.title} (${r.risk}, ${r.status}, amount ${Number(r.amount) || 0})`).join("; ") : "No records — priority queue is empty (0 items)." },
      { title: "High-risk count", detail: `High or Critical risk records: ${highRisk.length}` },
      { title: "Total value at stake", detail: `Total amount across reviewed records: ${total}` }], actions: ranked.slice(0, 3).map((r) => `Review ${r.reference} first and confirm its evidence.`) };
  }
  if (kind === "next-actions") {
    const actions = [];
    if (highRisk.length) actions.push(`Escalate ${highRisk.length} high-risk record(s) for reviewer attention.`);
    if ((byStatus.Open || 0) > 0) actions.push(`Move ${byStatus.Open} Open record(s) into Investigating with an accountable owner.`);
    if ((byStatus.Review || 0) > 0) actions.push(`Complete review decisions on ${byStatus.Review} record(s) in Review.`);
    if (!actions.length) actions.push("No pending actions — counts are Open: 0, Review: 0, High-risk: 0.");
    return { ...base, headline: `${feature.title} — next best actions`, metrics: [{ label: "Records reviewed", value: rows.length }, { label: "Open records", value: open.length }], sections: [
      { title: "Recommended next actions (labelled)", detail: actions.join(" ") },
      { title: "Open workload", detail: `Open or in-progress records: ${open.length}; Closed/Approved records: ${rows.length - open.length}` },
      { title: "Empty-state preserved", detail: `Statuses present: ${Object.keys(byStatus).length ? Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(", ") : "none (empty)"}` }], actions };
  }
  return { ...base, headline: `${feature.title} — portfolio summary`, metrics: [{ label: "Records reviewed", value: rows.length }, { label: "Total value", value: total }, { label: "Open records", value: open.length }, { label: "High-risk records", value: highRisk.length }], sections: [
    { title: "Portfolio summary (labelled)", detail: rows.length ? `${rows.length} record(s) for ${feature.title} totalling ${total}.` : `No records yet for ${feature.title} (0 records, total 0).` },
    { title: "Status breakdown", detail: Object.keys(byStatus).length ? Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(", ") : "No statuses (empty)." },
    { title: "Risk breakdown", detail: `High/Critical: ${highRisk.length}; Total records: ${rows.length}` }], actions: ["Validate the highest-value open records first.", "Retain evidence for every status change."] };
}
export function mountRecordInsights(app, { pool, auth, featureById }) {
  app.get("/api/features/:id/export", auth, async (req, res, next) => {
    try { const feature = featureById(req.params.id); const rows = (await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC", [feature.id])).rows;
      const filtered = filterRecords(rows, { q: req.query.q, status: req.query.status, risk: req.query.risk });
      const format = String(req.query.format || "json").toLowerCase();
      if (format === "csv") { res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${feature.id}-records.csv"`); return res.send(recordsToCsv(filtered)); }
      res.setHeader("Content-Disposition", `attachment; filename="${feature.id}-records.json"`); return res.send(recordsToJson(filtered));
    } catch (e) { next(e); }
  });
  app.post("/api/features/:id/ai-insights", auth, async (req, res, next) => {
    try { const feature = featureById(req.params.id); const rows = (await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 500", [feature.id])).rows;
      const kind = ["prioritize", "next-actions"].includes(req.body?.kind) ? req.body.kind : "summarize";
      res.json({ result: buildRecordInsights(rows, feature, kind) });
    } catch (e) { next(e); }
  });
}
