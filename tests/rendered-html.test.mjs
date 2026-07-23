import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps the agreed tracking targets and local storage", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  assert.match(page, /YEAR_TARGET = 600/);
  assert.match(page, /WEEK_TARGET = 13/);
  assert.match(page, /Cours biblique", 2\.5/);
  assert.match(page, /Maison \/ jardin/);
  assert.match(page, /localStorage\.setItem/);
  assert.match(layout, /title: "Suivi pionnier"/);
  assert.doesNotMatch(layout, /codex-preview/);
});
