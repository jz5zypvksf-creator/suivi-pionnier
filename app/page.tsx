"use client";

import type { User } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Category = "Ministère" | "Cours biblique" | "Informel" | "Autre" | "Maison / jardin";
type Entry = { id: string; date: string; category: Category; hours: number; note: string; student?: string };
type View = "accueil" | "encoder" | "journal" | "progression";
type PioneerType = "permanent" | "auxiliaire";
type ProgressSection = "heures" | "cours";
type SyncStatus = "local" | "syncing" | "synced" | "error";
type CloudStudent = { id: string; name: string; archived: boolean };
type CloudActivity = { id: string; activity_date: string; category: Category; hours: number; note: string; student_id: string | null };

const YEAR_TARGET = 600;
const WEEK_TARGET = 13;
const MONTH_TARGET = 30;
const STORAGE_KEY = "suivi-pionnier-entries-v1";
const SETTINGS_KEY = "suivi-pionnier-settings-v1";
const STUDENTS_KEY = "suivi-pionnier-students-v1";
const ARCHIVED_STUDENTS_KEY = "suivi-pionnier-archived-students-v1";
const PRODUCTION_URL = "https://suivi-pionnier.vercel.app/";
const categories: Category[] = ["Ministère", "Cours biblique", "Informel", "Autre", "Maison / jardin"];
const months = ["Sep", "Oct", "Nov", "Déc", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août"];
const fullMonths = ["Septembre", "Octobre", "Novembre", "Décembre", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août"];

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
const serviceMonthLabel = (start: number, index: number) => `${fullMonths[index]} ${index < 4 ? start : start + 1}`;
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
  const [selectedAuxMonth, setSelectedAuxMonth] = useState(serviceMonthIndex(today()));
  const [students, setStudents] = useState<string[]>([]);
  const [archivedStudents, setArchivedStudents] = useState<string[]>([]);
  const [progressSection, setProgressSection] = useState<ProgressSection>("heures");
  const [selectedStudyStudent, setSelectedStudyStudent] = useState("");
  const [managingStudent, setManagingStudent] = useState<string | null>(null);
  const [studentNameDraft, setStudentNameDraft] = useState("");
  const [showArchives, setShowArchives] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [cloudReady, setCloudReady] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState({ date: today(), category: "Ministère" as Category, hours: "2", note: "", student: "", newStudent: "" });

  const pushCloudSnapshot = async (
    userId: string,
    snapshotEntries = entries,
    snapshotStudents = students,
    snapshotArchived = archivedStudents,
    snapshotSettings = { selectedYear, pioneerType, selectedAuxMonth },
  ) => {
    const desiredNames = Array.from(new Set([
      ...snapshotStudents,
      ...snapshotArchived,
      ...snapshotEntries.flatMap((entry) => entry.student ? [entry.student] : []),
    ]));

    const { data: existingStudentRows, error: studentReadError } = await supabase
      .from("students")
      .select("id,name,archived")
      .eq("user_id", userId);
    if (studentReadError) throw studentReadError;

    const existingByName = new Map((existingStudentRows as CloudStudent[]).map((student) => [student.name.toLocaleLowerCase("fr"), student]));
    const studentRows = desiredNames.map((name) => {
      const existing = existingByName.get(name.toLocaleLowerCase("fr"));
      return {
        id: existing?.id ?? crypto.randomUUID(),
        user_id: userId,
        name,
        archived: snapshotArchived.includes(name),
      };
    });
    if (studentRows.length) {
      const { error } = await supabase.from("students").upsert(studentRows);
      if (error) throw error;
    }

    const studentIdByName = new Map(studentRows.map((student) => [student.name, student.id]));
    const activityRows = snapshotEntries.map((entry) => ({
      id: entry.id,
      user_id: userId,
      activity_date: entry.date,
      category: entry.category,
      hours: entry.hours,
      note: entry.note,
      student_id: entry.student ? (studentIdByName.get(entry.student) ?? null) : null,
    }));
    if (activityRows.length) {
      const { error } = await supabase.from("activities").upsert(activityRows);
      if (error) throw error;
    }

    const { data: existingActivities, error: activityReadError } = await supabase
      .from("activities")
      .select("id")
      .eq("user_id", userId);
    if (activityReadError) throw activityReadError;
    const localActivityIds = new Set(snapshotEntries.map((entry) => entry.id));
    for (const remoteEntry of existingActivities ?? []) {
      if (!localActivityIds.has(remoteEntry.id)) {
        const { error } = await supabase.from("activities").delete().eq("id", remoteEntry.id).eq("user_id", userId);
        if (error) throw error;
      }
    }

    const desiredStudentIds = new Set(studentRows.map((student) => student.id));
    for (const remoteStudent of existingStudentRows as CloudStudent[]) {
      if (!desiredStudentIds.has(remoteStudent.id)) {
        const { error } = await supabase.from("students").delete().eq("id", remoteStudent.id).eq("user_id", userId);
        if (error) throw error;
      }
    }

    const { error: settingsError } = await supabase.from("pioneer_settings").upsert({
      user_id: userId,
      pioneer_type: snapshotSettings.pioneerType,
      selected_year: snapshotSettings.selectedYear,
      selected_aux_month: snapshotSettings.selectedAuxMonth,
    });
    if (settingsError) throw settingsError;
  };

  const pullAndMergeCloud = async (user: User) => {
    setSyncStatus("syncing");
    setCloudReady(false);
    try {
      const [studentResult, activityResult, settingsResult] = await Promise.all([
        supabase.from("students").select("id,name,archived").eq("user_id", user.id),
        supabase.from("activities").select("id,activity_date,category,hours,note,student_id").eq("user_id", user.id),
        supabase.from("pioneer_settings").select("pioneer_type,selected_year,selected_aux_month").eq("user_id", user.id).maybeSingle(),
      ]);
      if (studentResult.error) throw studentResult.error;
      if (activityResult.error) throw activityResult.error;
      if (settingsResult.error) throw settingsResult.error;

      const remoteStudents = studentResult.data as CloudStudent[];
      const studentNameById = new Map(remoteStudents.map((student) => [student.id, student.name]));
      const remoteEntries = (activityResult.data as CloudActivity[]).map((entry): Entry => ({
        id: entry.id,
        date: entry.activity_date,
        category: entry.category,
        hours: Number(entry.hours),
        note: entry.note ?? "",
        student: entry.student_id ? studentNameById.get(entry.student_id) : undefined,
      }));

      const mergedEntriesById = new Map(entries.map((entry) => [entry.id, entry]));
      remoteEntries.forEach((entry) => mergedEntriesById.set(entry.id, entry));
      const mergedEntries = Array.from(mergedEntriesById.values()).sort((a, b) => b.date.localeCompare(a.date));
      const remoteActive = remoteStudents.filter((student) => !student.archived).map((student) => student.name);
      const remoteArchived = remoteStudents.filter((student) => student.archived).map((student) => student.name);
      const mergedArchived = Array.from(new Set([...archivedStudents, ...remoteArchived])).sort((a, b) => a.localeCompare(b, "fr"));
      const mergedActive = Array.from(new Set([...students, ...remoteActive]))
        .filter((student) => !mergedArchived.includes(student))
        .sort((a, b) => a.localeCompare(b, "fr"));
      const remoteSettings = settingsResult.data;
      const effectiveSettings = remoteSettings ? {
        selectedYear: remoteSettings.selected_year,
        pioneerType: remoteSettings.pioneer_type as PioneerType,
        selectedAuxMonth: remoteSettings.selected_aux_month,
      } : { selectedYear, pioneerType, selectedAuxMonth };

      setEntries(mergedEntries);
      setStudents(mergedActive);
      setArchivedStudents(mergedArchived);
      setSelectedYear(effectiveSettings.selectedYear);
      setPioneerType(effectiveSettings.pioneerType);
      setSelectedAuxMonth(effectiveSettings.selectedAuxMonth);
      await pushCloudSnapshot(user.id, mergedEntries, mergedActive, mergedArchived, effectiveSettings);
      setCloudReady(true);
      setSyncStatus("synced");
      setAuthMessage("Toutes les données sont synchronisées.");
    } catch {
      setSyncStatus("error");
      setAuthMessage("La synchronisation est momentanément indisponible. Vos données restent sur cet appareil.");
    }
  };

  const sendMagicLink = async (event: FormEvent) => {
    event.preventDefault();
    const email = authEmail.trim();
    if (!email) return;
    setAuthMessage("Envoi du lien de connexion…");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: PRODUCTION_URL },
    });
    setAuthMessage(error ? `Connexion impossible : ${error.message}` : "Un lien de connexion vous a été envoyé par e-mail.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setCloudReady(false);
    setSyncStatus("local");
    setAuthMessage("Mode local activé.");
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const savedArchivedStudents: string[] = JSON.parse(localStorage.getItem(ARCHIVED_STUDENTS_KEY) ?? "[]");
      setArchivedStudents(savedArchivedStudents);
      if (saved) {
        const savedEntries: Entry[] = JSON.parse(saved);
        setEntries(savedEntries);
        const entryStudents = savedEntries.flatMap((entry) => entry.student ? [entry.student] : []);
        const savedStudents: string[] = JSON.parse(localStorage.getItem(STUDENTS_KEY) ?? "[]");
        setStudents(Array.from(new Set([...savedStudents, ...entryStudents])).filter((student) => !savedArchivedStudents.includes(student)).sort((a, b) => a.localeCompare(b, "fr")));
      } else {
        const savedStudents: string[] = JSON.parse(localStorage.getItem(STUDENTS_KEY) ?? "[]");
        setStudents(savedStudents.filter((student) => !savedArchivedStudents.includes(student)));
      }
      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (typeof settings.selectedYear === "number") setSelectedYear(settings.selectedYear);
        if (settings.pioneerType === "permanent" || settings.pioneerType === "auxiliaire") setPioneerType(settings.pioneerType);
        if (Number.isInteger(settings.selectedAuxMonth) && settings.selectedAuxMonth >= 0 && settings.selectedAuxMonth < 12) setSelectedAuxMonth(settings.selectedAuxMonth);
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(SETTINGS_KEY, JSON.stringify({ selectedYear, pioneerType, selectedAuxMonth }));
  }, [selectedYear, pioneerType, selectedAuxMonth, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
  }, [students, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(ARCHIVED_STUDENTS_KEY, JSON.stringify(archivedStudents));
  }, [archivedStudents, ready]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUser(data.user));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (ready && authUser) queueMicrotask(() => void pullAndMergeCloud(authUser));
    if (ready && !authUser) {
      queueMicrotask(() => {
        setCloudReady(false);
        setSyncStatus("local");
      });
    }
    // La synchronisation initiale doit uniquement suivre l'identité et le chargement local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, ready]);

  useEffect(() => {
    if (!authUser || !cloudReady) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      setSyncStatus("syncing");
      pushCloudSnapshot(authUser.id)
        .then(() => setSyncStatus("synced"))
        .catch(() => setSyncStatus("error"));
    }, 800);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
    // Les données listées constituent l'instantané à envoyer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, students, archivedStudents, selectedYear, pioneerType, selectedAuxMonth, authUser?.id, cloudReady]);

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
    const currentMonth = monthly[selectedAuxMonth];
    const studentCount = new Set(yearEntries.filter((e) => e.category === "Cours biblique" && e.student && !archivedStudents.includes(e.student)).map((e) => e.student)).size;
    return { total, maintenance, weekly, monthly, currentMonth, yearEntries, studentCount };
  }, [entries, selectedYear, selectedAuxMonth, archivedStudents]);

  const addEntry = (category: Category, hours: number, note = "") => {
    setSelectedYear(serviceYearStart(new Date()));
    if (pioneerType === "auxiliaire") setSelectedAuxMonth(serviceMonthIndex(today()));
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
    if (pioneerType === "auxiliaire") setSelectedAuxMonth(serviceMonthIndex(form.date));
    setForm((current) => ({ ...current, hours: "", note: "", newStudent: "", student: student ?? "" }));
    setNotice("Activité enregistrée");
    setView("journal");
  };

  const prepareBibleStudy = () => {
    setForm((current) => ({ ...current, date: today(), category: "Cours biblique", hours: "2,5", note: "", student: students[0] ?? "__new__", newStudent: "" }));
    setView("encoder");
  };

  const openStudentProfile = (student: string) => {
    setManagingStudent(student);
    setStudentNameDraft(student);
  };

  const saveStudentProfile = () => {
    if (!managingStudent) return;
    const nextName = studentNameDraft.trim();
    if (!nextName) {
      setNotice("Le nom de l’étudiant est requis");
      return;
    }
    if (nextName !== managingStudent && (students.includes(nextName) || archivedStudents.includes(nextName))) {
      setNotice("Un étudiant porte déjà ce nom");
      return;
    }
    const previousName = managingStudent;
    setStudents((current) => current.map((student) => student === previousName ? nextName : student).sort((a, b) => a.localeCompare(b, "fr")));
    setEntries((current) => current.map((entry) => entry.student === previousName ? { ...entry, student: nextName } : entry));
    setForm((current) => ({ ...current, student: current.student === previousName ? nextName : current.student }));
    setSelectedStudyStudent((current) => current === previousName ? nextName : current);
    setManagingStudent(null);
    setNotice("Profil étudiant modifié");
  };

  const archiveStudentProfile = () => {
    if (!managingStudent) return;
    const linkedCourses = entries.filter((entry) => entry.category === "Cours biblique" && entry.student === managingStudent).length;
    const confirmed = window.confirm(`Archiver le profil de ${managingStudent} ? Ses ${linkedCourses} cours et toutes ses notes seront conservés et pourront être restaurés.`);
    if (!confirmed) return;
    const archivedName = managingStudent;
    setStudents((current) => current.filter((student) => student !== archivedName));
    setArchivedStudents((current) => Array.from(new Set([...current, archivedName])).sort((a, b) => a.localeCompare(b, "fr")));
    setForm((current) => ({ ...current, student: current.student === archivedName ? "" : current.student }));
    setSelectedStudyStudent((current) => current === archivedName ? "" : current);
    setManagingStudent(null);
    setNotice("Profil étudiant archivé");
  };

  const restoreStudentProfile = (student: string) => {
    setArchivedStudents((current) => current.filter((name) => name !== student));
    setStudents((current) => Array.from(new Set([...current, student])).sort((a, b) => a.localeCompare(b, "fr")));
    setNotice(`${student} a été rétabli dans les étudiants actifs`);
  };

  const trackedTotal = pioneerType === "permanent" ? stats.total : stats.currentMonth;
  const activeTarget = pioneerType === "permanent" ? YEAR_TARGET : MONTH_TARGET;
  const progress = Math.min((trackedTotal / activeTarget) * 100, 100);
  const weekProgress = Math.min((stats.weekly / WEEK_TARGET) * 100, 100);
  const maxMonth = Math.max(...stats.monthly, 50);
  const courseStudents = Array.from(new Set(stats.yearEntries.filter((entry) => entry.category === "Cours biblique" && entry.student && !archivedStudents.includes(entry.student)).map((entry) => entry.student!))).sort((a, b) => a.localeCompare(b, "fr"));
  const activeStudyStudent = courseStudents.includes(selectedStudyStudent) ? selectedStudyStudent : (courseStudents[0] ?? "");
  const studentCourses = stats.yearEntries
    .filter((entry) => entry.category === "Cours biblique" && entry.student === activeStudyStudent)
    .sort((a, b) => b.date.localeCompare(a.date));
  const studentCourseHours = studentCourses.reduce((total, entry) => total + entry.hours, 0);
  const latestProgressNote = studentCourses.find((entry) => entry.note)?.note;
  const managedStudentCourses = managingStudent ? entries.filter((entry) => entry.category === "Cours biblique" && entry.student === managingStudent) : [];
  const managedStudentHours = managedStudentCourses.reduce((total, entry) => total + entry.hours, 0);
  const syncLabel = syncStatus === "syncing" ? "Synchronisation…" : syncStatus === "synced" ? "Synchronisé" : syncStatus === "error" ? "À resynchroniser" : "Mode local";

  if (!ready) return <main className="loading">Préparation de votre suivi…</main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">SP</div>
        <div className={`service-controls ${pioneerType === "auxiliaire" ? "auxiliary" : ""}`}>
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
          {pioneerType === "auxiliaire" && <label>
            <span>Mois auxiliaire</span>
            <select value={selectedAuxMonth} onChange={(e) => setSelectedAuxMonth(Number(e.target.value))} aria-label="Mois du service auxiliaire">
              {fullMonths.map((_, index) => <option key={index} value={index}>{serviceMonthLabel(selectedYear, index)}</option>)}
            </select>
          </label>}
        </div>
        <div className="year-pill">{pioneerType === "permanent" ? "600 h" : "30 h/mois"}</div>
      </header>

      <button className={`sync-strip ${syncStatus}`} onClick={() => setShowSyncPanel(true)}>
        <span className="sync-cloud">☁</span>
        <span><b>{authUser ? syncLabel : "Activer la synchronisation"}</b><small>{authUser?.email ?? "Retrouvez vos données sur tous vos appareils"}</small></span>
        <span className="sync-arrow">›</span>
      </button>

      {notice && <div className="toast" role="status">{notice}</div>}

      <section className="content">
        {view === "accueil" && (
          <>
            <section className="hero-card">
              <div className="hero-copy">
                <p className="eyebrow light">{pioneerType === "permanent" ? "Progression annuelle" : `Progression · ${fullMonths[selectedAuxMonth]}`}</p>
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
                {form.student && form.student !== "__new__" && <button type="button" className="manage-student" onClick={() => openStudentProfile(form.student)}>Gérer le profil de {form.student}</button>}
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
            <p className="eyebrow">{serviceYearLabel(selectedYear)}</p>
            <h2>{progressSection === "heures" ? "Progression par mois" : "Suivi cours bibliques"}</h2>
            <div className="progress-tabs" role="tablist" aria-label="Type de progression">
              <button className={progressSection === "heures" ? "active" : ""} onClick={() => setProgressSection("heures")} role="tab" aria-selected={progressSection === "heures"}>Heures</button>
              <button className={progressSection === "cours" ? "active" : ""} onClick={() => setProgressSection("cours")} role="tab" aria-selected={progressSection === "cours"}>Suivi cours bibliques</button>
            </div>

            {progressSection === "heures" ? <>
              <div className="summary-grid">
                {pioneerType === "permanent" ? <>
                  <div><small>Année</small><b>{formatHours(stats.total)}</b></div>
                  <div><small>Reste</small><b>{formatHours(Math.max(YEAR_TARGET - stats.total, 0))}</b></div>
                  <div><small>Moyenne/mois</small><b>{formatHours(stats.total / 12)}</b></div>
                </> : <>
                  <div><small>Mois affiché</small><b>{months[selectedAuxMonth]}</b></div>
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
            </> : courseStudents.length ? <>
              <div className="study-picker-row">
                <label className="study-picker">Étudiant
                  <select value={activeStudyStudent} onChange={(e) => setSelectedStudyStudent(e.target.value)}>
                    {courseStudents.map((student) => <option key={student} value={student}>{student}</option>)}
                  </select>
                </label>
                <button className="profile-button" onClick={() => openStudentProfile(activeStudyStudent)}>Profil</button>
              </div>
              <div className="study-overview">
                <div><small>Cours donnés</small><b>{studentCourses.length}</b></div>
                <div><small>Heures</small><b>{formatHours(studentCourseHours)}</b></div>
                <div><small>Dernier cours</small><b>{studentCourses[0] ? new Date(`${studentCourses[0].date}T12:00:00`).toLocaleDateString("fr-BE", { day: "numeric", month: "short" }) : "—"}</b></div>
              </div>
              <div className="latest-note">
                <p className="eyebrow">Dernière note de progression</p>
                <p>{latestProgressNote || "Aucune note de progression n’a encore été renseignée."}</p>
              </div>
              <div className="course-history-heading"><h3>Historique des cours</h3><span>{studentCourses.length} cours</span></div>
              <div className="course-timeline">
                {studentCourses.map((course) => <article key={course.id}>
                  <div className="timeline-dot" />
                  <div className="course-card">
                    <div><time>{new Date(`${course.date}T12:00:00`).toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</time><b>{formatHours(course.hours)}</b></div>
                    <p>{course.note || "Aucune note pour ce cours."}</p>
                  </div>
                </article>)}
              </div>
            </> : <div className="empty">Ajoutez d’abord un cours biblique associé à un étudiant pour consulter son suivi.</div>}
            {progressSection === "cours" && <button className="archives-button" onClick={() => setShowArchives(true)}>Étudiants archivés <span>{archivedStudents.length}</span></button>}
          </section>
        )}
      </section>

      {managingStudent && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setManagingStudent(null); }}>
        <section className="student-modal" role="dialog" aria-modal="true" aria-labelledby="student-profile-title">
          <button className="modal-close" onClick={() => setManagingStudent(null)} aria-label="Fermer">×</button>
          <p className="eyebrow">Profil étudiant</p>
          <h2 id="student-profile-title">{managingStudent}</h2>
          <div className="profile-stats">
            <div><small>Cours enregistrés</small><b>{managedStudentCourses.length}</b></div>
            <div><small>Total</small><b>{formatHours(managedStudentHours)}</b></div>
          </div>
          <label>Nom de l’étudiant
            <input value={studentNameDraft} onChange={(e) => setStudentNameDraft(e.target.value)} />
          </label>
          <div className="modal-actions">
            <button className="primary" onClick={saveStudentProfile}>Enregistrer les modifications</button>
            {managedStudentCourses.length > 0 && <button className="secondary" onClick={() => {
              setSelectedStudyStudent(managingStudent);
              setProgressSection("cours");
              setView("progression");
              setManagingStudent(null);
            }}>Voir son suivi complet</button>}
            <button className="archive-action" onClick={archiveStudentProfile}>Archiver le profil</button>
          </div>
          <p className="archive-note">L’archivage masque l’étudiant des listes actives, mais conserve tous ses cours et toutes ses notes. Vous pourrez le rétablir plus tard.</p>
        </section>
      </div>}

      {showArchives && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowArchives(false); }}>
        <section className="student-modal archives-modal" role="dialog" aria-modal="true" aria-labelledby="archives-title">
          <button className="modal-close" onClick={() => setShowArchives(false)} aria-label="Fermer">×</button>
          <p className="eyebrow">Conservation des dossiers</p>
          <h2 id="archives-title">Étudiants archivés</h2>
          {archivedStudents.length ? <div className="archive-list">
            {archivedStudents.map((student) => {
              const archivedCourses = entries.filter((entry) => entry.category === "Cours biblique" && entry.student === student);
              return <article key={student}>
                <div><b>{student}</b><small>{archivedCourses.length} cours · {formatHours(archivedCourses.reduce((total, entry) => total + entry.hours, 0))}</small></div>
                <button onClick={() => restoreStudentProfile(student)}>Rétablir</button>
              </article>;
            })}
          </div> : <div className="empty">Aucun étudiant archivé.</div>}
        </section>
      </div>}

      {showSyncPanel && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSyncPanel(false); }}>
        <section className="student-modal sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title">
          <button className="modal-close" onClick={() => setShowSyncPanel(false)} aria-label="Fermer">×</button>
          <p className="eyebrow">Multi-appareils</p>
          <h2 id="sync-title">Synchronisation</h2>
          {authUser ? <>
            <div className={`sync-account-state ${syncStatus}`}>
              <span>☁</span>
              <div><b>{syncLabel}</b><small>{authUser.email}</small></div>
            </div>
            <p className="sync-explanation">Vos heures, étudiants, cours, notes et archives sont associés à ce compte.</p>
            <div className="modal-actions">
              <button className="primary" onClick={() => void pullAndMergeCloud(authUser)}>Synchroniser maintenant</button>
              <button className="secondary" onClick={signOut}>Se déconnecter</button>
            </div>
          </> : <>
            <p className="sync-explanation">Utilisez la même adresse e-mail sur votre ordinateur, votre iPhone et votre téléphone Android. Aucun mot de passe n’est nécessaire.</p>
            <form className="sync-form" onSubmit={sendMagicLink}>
              <label>Adresse e-mail
                <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="votre@email.be" autoComplete="email" required />
              </label>
              <button className="primary" type="submit">Recevoir le lien de connexion</button>
            </form>
          </>}
          {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
          <p className="privacy-note">Lors de la première connexion, les données déjà enregistrées sur cet appareil seront importées automatiquement.</p>
        </section>
      </div>}

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
