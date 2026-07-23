"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Category = "Ministère" | "Cours biblique" | "Informel" | "Autre" | "Maison / jardin";
type Entry = { id: string; date: string; category: Category; hours: number; note: string; student?: string };
type View = "accueil" | "encoder" | "journal" | "progression";
type PioneerType = "permanent" | "auxiliaire";

const YEAR_TARGET = 600;
const WEEK_TARGET = 13;
const MONTH_TARGET = 30;
const STORAGE_KEY = "suivi-pionnier-entries-v1";
const SETTINGS_KEY = "suivi-pionnier-settings-v1";
const STUDENTS_KEY = "suivi-pionnier-students-v1";
const categories: Category[] = ["Ministère", "Cours biblique", "Informel", "Autre", "Maison / jardin"];
const months = ["Sep", "Oct", "Nov", "Déc", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août"];

const today = () => new Date().toISOString().slice(0, 10);
const serviceYearStart = (date: string | Date) => {
  const d = typeof date === "string" ? new Date(`${date}T12:00:00`) : date;
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
};
const serviceYears = (() => {
  const current = serviceYearStart(new Date());
  return Array.from({ length: 5 }, (_, i) => current - 1 + i);
})();
const serviceYearLabel = (start: number) => `${start}–${start + 1}`;
const serviceMonthIndex = (date: string) => {
  const d = new Date(`${date}T12:00:00`);
  return (d.getMonth() + 4) % 12;
};
const startOfWeek = (date = new Date()) => {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};
const formatHours = (value: number) => `${value.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} h`;

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [view, setView] = useState<View>("accueil");
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedYear, setSelectedYear] = useState(serviceYearStart(new Date()));
  const [pioneerType, setPioneerType] = useState<PioneerType>("permanent");
  const [students, setStudents] = useState<string[]>([]);
  const [form, setForm] = useState({ date: today(), category: "Ministère" as Category, hours: "2", note: "", student: "", newStudent: "" });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const savedEntries: Entry[] = JSON.parse(saved);
        setEntries(savedEntries);
        const entryStudents = savedEntries.flatMap((entry) => entry.student ? [entry.student] : []);
        const savedStudents: string[] = JSON.parse(localStorage.getItem(STUDENTS_KEY) ?? "[]");
        setStudents(Array.from(new Set([...savedStudents, ...entryStudents])).sort((a, b) => a.localeCompare(b, "fr")));
      } else {
        const savedStudents: string[] = JSON.parse(localStorage.getItem(STUDENTS_KEY) ?? "[]");
        setStudents(savedStudents);
      }
      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (typeof settings.selectedYear === "number") setSelectedYear(settings.selectedYear);
        if (settings.pioneerType === "permanent" || settings.pioneerType === "auxiliaire") setPioneerType(settings.pioneerType);
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(SETTINGS_KEY, JSON.stringify({ selectedYear, pioneerType }));
  }, [selectedYear, pioneerType, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
  }, [students, ready]);

  const stats = useMemo(() => {
    const yearEntries = entries.filter((e) => serviceYearStart(e.date) === selectedYear);
    const ministry = yearEntries.filter((e) => e.category !== "Maison / jardin");
    const total = ministry.reduce((sum, e) => sum + e.hours, 0);
    const maintenance = yearEntries.filter((e) => e.category === "Maison / jardin").reduce((sum, e) => sum + e.hours, 0);
    const weekStart = startOfWeek();
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const weekly = ministry.filter((e) => {
      const d = new Date(`${e.date}T12:00:00`);
      return d >= weekStart && d < weekEnd;
    }).reduce((sum, e) => sum + e.hours, 0);
    const monthly = Array.from({ length: 12 }, (_, i) =>
      ministry.filter((e) => serviceMonthIndex(e.date) === i).reduce((sum, e) => sum + e.hours, 0)
    );
    const todayIndex = serviceMonthIndex(today());
    const currentMonth = monthly[todayIndex];
    const studentCount = new Set(yearEntries.filter((e) => e.category === "Cours biblique" && e.student).map((e) => e.student)).size;
    return { total, maintenance, weekly, monthly, currentMonth, todayIndex, yearEntries, studentCount };
  }, [entries, selectedYear]);

  const addEntry = (category: Category, hours: number, note = "") => {
    setSelectedYear(serviceYearStart(new Date()));
    setEntries((current) => [{ id: crypto.randomUUID(), date: today(), category, hours, note }, ...current]);
    setNotice(`${formatHours(hours)} ajoutées — ${category}`);
    window.setTimeout(() => setNotice(""), 2500);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const hours = Number(form.hours.replace(",", "."));
    if (!form.date || !Number.isFinite(hours) || hours <= 0) return;
    let student: string | undefined;
    if (form.category === "Cours biblique") {
      student = form.student === "__new__" ? form.newStudent.trim() : form.student;
      if (!student) {
        setNotice("Choisissez ou ajoutez un étudiant");
        return;
      }
      setStudents((current) => Array.from(new Set([...current, student!])).sort((a, b) => a.localeCompare(b, "fr")));
    }
    setEntries((current) => [{ id: crypto.randomUUID(), date: form.date, category: form.category, hours, note: form.note.trim(), student }, ...current]);
    setSelectedYear(serviceYearStart(form.date));
    setForm((current) => ({ ...current, hours: "", note: "", newStudent: "", student: student ?? "" }));
    setNotice("Activité enregistrée");
    setView("journal");
  };

  const prepareBibleStudy = () => {
    setForm((current) => ({ ...current, date: today(), category: "Cours biblique", hours: "2,5", note: "", student: students[0] ?? "__new__", newStudent: "" }));
    setView("encoder");
  };

  const trackedTotal = pioneerType === "permanent" ? stats.total : stats.currentMonth;
  const activeTarget = pioneerType === "permanent" ? YEAR_TARGET : MONTH_TARGET;
  const progress = Math.min((trackedTotal / activeTarget) * 100, 100);
  const weekProgress = Math.min((stats.weekly / WEEK_TARGET) * 100, 100);
  const maxMonth = Math.max(...stats.monthly, 50);

  if (!ready) return <main className="loading">Préparation de votre suivi…</main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">SP</div>
        <div className="service-controls">
          <label>
            <span>Année de service</span>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} aria-label="Année de service">
              {serviceYears.map((year) => <option key={year} value={year}>{serviceYearLabel(year)}</option>)}
            </select>
          </label>
          <label>
            <span>Service</span>
            <select value={pioneerType} onChange={(e) => setPioneerType(e.target.value as PioneerType)} aria-label="Type de service">
              <option value="permanent">Pionnier permanent</option>
              <option value="auxiliaire">Pionnier auxiliaire</option>
            </select>
          </label>
        </div>
        <div className="year-pill">{pioneerType === "permanent" ? "600 h" : "30 h/mois"}</div>
      </header>

      {notice && <div className="toast" role="status">{notice}</div>}

      <section className="content">
        {view === "accueil" && (
          <>
            <section className="hero-card">
              <div className="hero-copy">
                <p className="eyebrow light">{pioneerType === "permanent" ? "Progression annuelle" : `Progression · ${months[stats.todayIndex]}`}</p>
                <strong>{formatHours(trackedTotal)}</strong>
                <span>sur {activeTarget} h</span>
              </div>
              <div className="ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
                <div><b>{Math.round(progress)}%</b><small>accompli</small></div>
              </div>
              <div className="hero-progress"><i style={{ width: `${progress}%` }} /></div>
              <p className="encouragement">{activeTarget - trackedTotal > 0 ? `Encore ${formatHours(activeTarget - trackedTotal)} — avancez à votre rythme.` : `Objectif ${pioneerType === "permanent" ? "annuel" : "mensuel"} atteint. Bravo !`}</p>
            </section>

            {pioneerType === "permanent" && <>
              <div className="section-heading">
                <div><p className="eyebrow">Cette semaine</p><h2>{formatHours(stats.weekly)} <span>/ {WEEK_TARGET} h</span></h2></div>
                <span className={stats.weekly >= WEEK_TARGET ? "status good" : "status"}>{stats.weekly >= WEEK_TARGET ? "Objectif atteint" : `${formatHours(Math.max(WEEK_TARGET - stats.weekly, 0))} restantes`}</span>
              </div>
              <div className="thin-progress"><i style={{ width: `${weekProgress}%` }} /></div>
            </>}
            <p className="fixed-note">Vos deux cours du week-end représentent une base fixe de 5 h.</p>

            <h2 className="quick-title">Ajouter rapidement</h2>
            <div className="quick-grid">
              <button onClick={() => addEntry("Ministère", 2)}><span>＋</span><b>2 h</b><small>Ministère</small></button>
              <button onClick={prepareBibleStudy}><span>＋</span><b>2 h 30</b><small>Cours biblique</small></button>
              <button onClick={() => addEntry("Informel", 1)}><span>＋</span><b>1 h</b><small>Informel</small></button>
              <button className="maintenance" onClick={() => addEntry("Maison / jardin", 2)}><span>＋</span><b>2 h</b><small>Maison / jardin</small></button>
            </div>

            <div className="maintenance-card">
              <span className="maintenance-icon">⌂</span>
              <div><p className="eyebrow">Suivi séparé</p><h3>Maison & jardin</h3><small>Non comptabilisé dans l’objectif</small></div>
              <b>{formatHours(stats.maintenance)}</b>
            </div>

            <div className="recent-heading"><h2>Dernières activités</h2><button onClick={() => setView("journal")}>Tout voir</button></div>
            <EntryList entries={stats.yearEntries.slice(0, 3)} onDelete={(id) => setEntries(entries.filter((e) => e.id !== id))} empty={`Aucune activité pour ${serviceYearLabel(selectedYear)}.`} />
          </>
        )}

        {view === "encoder" && (
          <section className="panel">
            <p className="eyebrow">Nouvelle activité</p>
            <h2>Encoder mes heures</h2>
            <form onSubmit={submit}>
              <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
              <label>Catégorie<select value={form.category} onChange={(e) => {
                const category = e.target.value as Category;
                setForm({ ...form, category, student: category === "Cours biblique" ? (form.student || students[0] || "__new__") : form.student });
              }}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
              {form.category === "Cours biblique" && <div className="student-fields">
                <label>Étudiant
                  <select value={form.student} onChange={(e) => setForm({ ...form, student: e.target.value })} required>
                    <option value="" disabled>Choisir un étudiant</option>
                    {students.map((student) => <option key={student} value={student}>{student}</option>)}
                    <option value="__new__">＋ Ajouter un nouvel étudiant</option>
                  </select>
                </label>
                {form.student === "__new__" && <label>Nom du nouvel étudiant
                  <input value={form.newStudent} onChange={(e) => setForm({ ...form, newStudent: e.target.value })} placeholder="Prénom et nom" autoFocus required />
                </label>}
              </div>}
              <label>Durée en heures<input inputMode="decimal" placeholder="Ex. 2,5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} required /></label>
              <label>{form.category === "Cours biblique" ? "Note sur ce cours (facultatif)" : "Note (facultatif)"}<textarea placeholder={form.category === "Cours biblique" ? "Ex. thème étudié, prochaine étape…" : "Ex. visite, activité…"} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
              <button className="primary" type="submit">Enregistrer l’activité</button>
            </form>
          </section>
        )}

        {view === "journal" && (
          <section className="panel">
            <p className="eyebrow">Historique</p><h2>Mon journal</h2>
            <EntryList entries={stats.yearEntries} onDelete={(id) => setEntries(entries.filter((e) => e.id !== id))} empty={`Votre journal ${serviceYearLabel(selectedYear)} est encore vide.`} />
          </section>
        )}

        {view === "progression" && (
          <section className="panel">
            <p className="eyebrow">{serviceYearLabel(selectedYear)}</p><h2>Progression par mois</h2>
            <div className="summary-grid">
              {pioneerType === "permanent" ? <>
                <div><small>Année</small><b>{formatHours(stats.total)}</b></div>
                <div><small>Reste</small><b>{formatHours(Math.max(YEAR_TARGET - stats.total, 0))}</b></div>
                <div><small>Moyenne/mois</small><b>{formatHours(stats.total / 12)}</b></div>
              </> : <>
                <div><small>Mois affiché</small><b>{months[stats.todayIndex]}</b></div>
                <div><small>Réalisé</small><b>{formatHours(stats.currentMonth)}</b></div>
                <div><small>Objectif</small><b>{MONTH_TARGET} h</b></div>
              </>}
              <div><small>Étudiants</small><b>{stats.studentCount}</b></div>
            </div>
            <div className="chart" aria-label="Heures de ministère par mois">
              {stats.monthly.map((value, i) => <div className="bar-col" key={months[i]}><span>{value || ""}</span><i style={{ height: `${Math.max((value / maxMonth) * 180, value ? 8 : 2)}px` }} /><small>{months[i]}</small></div>)}
            </div>
            <div className="month-list">
              {months.map((month, i) => <div key={month}><span>{month}</span><i><em style={{ width: `${Math.min((stats.monthly[i] / (pioneerType === "permanent" ? 50 : MONTH_TARGET)) * 100, 100)}%` }} /></i><b>{formatHours(stats.monthly[i])}</b></div>)}
            </div>
          </section>
        )}
      </section>

      <nav className="bottom-nav" aria-label="Navigation principale">
        <button className={view === "accueil" ? "active" : ""} onClick={() => setView("accueil")}><span>⌂</span>Accueil</button>
        <button className={view === "encoder" ? "active add" : "add"} onClick={() => setView("encoder")}><span>＋</span>Encoder</button>
        <button className={view === "journal" ? "active" : ""} onClick={() => setView("journal")}><span>≡</span>Journal</button>
        <button className={view === "progression" ? "active" : ""} onClick={() => setView("progression")}><span>▥</span>Progression</button>
      </nav>
    </main>
  );
}

function EntryList({ entries, onDelete, empty }: { entries: Entry[]; onDelete: (id: string) => void; empty: string }) {
  if (!entries.length) return <div className="empty">{empty}</div>;
  return <div className="entry-list">{entries.map((entry) => (
    <article key={entry.id}>
      <div className={`entry-icon ${entry.category === "Maison / jardin" ? "home" : ""}`}>{entry.category === "Cours biblique" ? "▤" : entry.category === "Maison / jardin" ? "⌂" : "○"}</div>
      <div><h3>{entry.category}{entry.student ? ` · ${entry.student}` : ""}</h3><p>{new Date(`${entry.date}T12:00:00`).toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short" })}{entry.note ? ` · ${entry.note}` : ""}</p></div>
      <b>{formatHours(entry.hours)}</b>
      <button className="delete" aria-label={`Supprimer ${entry.category}`} onClick={() => onDelete(entry.id)}>×</button>
    </article>
  ))}</div>;
}
