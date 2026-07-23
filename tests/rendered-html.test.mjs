import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the pioneer tracking application", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Suivi pionnier<\/title>/i);
  assert.match(html, /Suivi pionnier/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps the agreed tracking targets and local storage", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /YEAR_TARGET = 600/);
  assert.match(page, /WEEK_TARGET = 13/);
  assert.match(page, /Cours biblique", 2\.5/);
  assert.match(page, /Maison \/ jardin/);
  assert.match(page, /localStorage\.setItem/);
});
