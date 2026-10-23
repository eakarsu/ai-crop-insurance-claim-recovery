import test from "node:test";
import assert from "node:assert/strict";
import { filterRecords, recordsToCsv, buildRecordInsights } from "../recordInsights.mjs";
const rows = [
  { id: 1, reference: "A-1", title: "Alpha case", status: "Open", owner: "Sam", risk: "High", due_date: "2026-09-30", amount: 0, feature_id: "f1", payload: { flagged: false, note: "" } },
  { id: 2, reference: "B-2", title: "Beta case", status: "Closed", owner: "Lee", risk: "Low", due_date: "2026-08-01", amount: 250, feature_id: "f1", payload: {} },
];
test("filterRecords searches and filters main list", () => {
  assert.equal(filterRecords(rows, { q: "alpha" }).length, 1);
  assert.equal(filterRecords(rows, { status: "Closed" })[0].reference, "B-2");
  assert.equal(filterRecords(rows, { risk: "High" }).length, 1);
  assert.equal(filterRecords(rows, { q: "missing" }).length, 0);
});
test("CSV export preserves 0, false and empty", () => {
  const csv = recordsToCsv(rows);
  assert.ok(csv.includes("A-1")); assert.ok(csv.split("\n")[1].includes(",0,"));
  assert.ok(csv.includes("false")); assert.ok(csv.startsWith("id,reference,title"));
});
test("deterministic AI fallback is labelled aiGenerated:false with sections", () => {
  const feature = { id: "f1", title: "Test capability" };
  for (const kind of ["summarize", "prioritize", "next-actions"]) {
    const r = buildRecordInsights(rows, feature, kind);
    assert.equal(r.aiGenerated, false); assert.ok(r.label.includes("Deterministic fallback"));
    assert.ok(Array.isArray(r.sections) && r.sections.length >= 2 && r.sections.every((s) => s.title && "detail" in s));
  }
  const empty = buildRecordInsights([], feature, "summarize");
  assert.equal(empty.recordCount, 0); assert.ok(empty.sections.some((s) => String(s.detail).includes("0")));
});
