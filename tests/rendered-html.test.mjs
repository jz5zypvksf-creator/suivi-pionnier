import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps the agreed tracking targets and local storage", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  assert.match(page, /YEAR_TARGET = 600/);
  assert.match(page, /WEEK_TARGET = 13/);
  assert.match(page, /MONTH_TARGET = 30/);
  assert.match(page, /Pionnier permanent/);
  assert.match(page, /Pionnier auxiliaire/);
  assert.match(page, /Mois auxiliaire/);
  assert.match(page, /selectedAuxMonth/);
  assert.match(page, /serviceYearLabel/);
  assert.match(page, /STUDENTS_KEY/);
  assert.match(page, /Ajouter un nouvel étudiant/);
  assert.match(page, /Note sur ce cours/);
  assert.match(page, /Suivi cours bibliques/);
  assert.match(page, /Dernière note de progression/);
  assert.match(page, /Historique des cours/);
  assert.match(page, /Gérer le profil/);
  assert.match(page, /Enregistrer les modifications/);
  assert.match(page, /Supprimer le profil et son historique/);
  assert.match(page, /category: "Cours biblique", hours: "2,5"/);
  assert.match(page, /Maison \/ jardin/);
  assert.match(page, /localStorage\.setItem/);
  assert.match(layout, /title: "Suivi pionnier"/);
  assert.doesNotMatch(layout, /codex-preview/);
});
