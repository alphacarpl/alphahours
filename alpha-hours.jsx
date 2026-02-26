import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════
const ENTRIES_KEY = "alphahours:entries:v2";
const PROJECTS_KEY = "alphahours:projects";

const CATEGORIES = {
  development: { label: "Programowanie", color: "#00e5a0", icon: "⌨️" },
  design:      { label: "Design",        color: "#6c5ce7", icon: "🎨" },
  meetings:    { label: "Spotkania",     color: "#00b4d8", icon: "🗣️" },
  admin:       { label: "Administracja", color: "#f39c12", icon: "📋" },
  testing:     { label: "Testowanie",    color: "#e74c3c", icon: "🧪" },
  other:       { label: "Inne",          color: "#8888a0", icon: "📦" },
};

const DAYS = ["Pon", "Wto", "Śro", "Czw", "Pią", "Sob", "Nie"];
const MONTHS = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
const PROJECT_COLORS = ["#00e5a0","#6c5ce7","#00b4d8","#f39c12","#e74c3c","#e84393","#fdcb6e","#55efc4","#a29bfe","#74b9ff"];

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => new Date().toISOString().split("T")[0];

function formatDur(min) {
  if (!min || min <= 0) return "0min";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m}min`;
}

function formatDate(d) {
  return new Date(d + "T00:00").toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "long" });
}

function calcMin(s, e, b = 0) {
  const [sh, sm] = s.split(":").map(Number);
  const [eh, em] = e.split(":").map(Number);
  return Math.max(0, eh * 60 + em - sh * 60 - sm - (b || 0));
}

function weekNum(dateStr) {
  const d = new Date(dateStr + "T00:00");
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7) + 1;
}

// ═══════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════
async function loadStorage(key, fallback = []) {
  try {
    const r = await window.storage.get(key, true);
    return r?.value ? JSON.parse(r.value) : fallback;
  } catch { return fallback; }
}
async function saveStorage(key, data) {
  try { await window.storage.set(key, JSON.stringify(data), true); return true; } catch { return false; }
}

// ═══════════════════════════════════════════════
//  THEMES
// ═══════════════════════════════════════════════
const THEMES = {
  dark: {
    bg: "#0a0a0f", bgEl: "#111119", bgCard: "#16161f", bgInput: "#0e0e16",
    surface: "#1e1e2a", accent: "#00e5a0", accentDim: "#00e5a018", accentMid: "#00e5a040",
    accent2: "#6c5ce7", accent3: "#00b4d8", warn: "#f39c12", danger: "#e74c3c",
    text: "#e8e8f0", textDim: "#8888a0", textBright: "#fff", border: "#2a2a3a",
    calToday: "#00e5a015", calHas: "#6c5ce718",
  },
  light: {
    bg: "#f5f5f8", bgEl: "#ffffff", bgCard: "#ffffff", bgInput: "#f0f0f5",
    surface: "#eeeef2", accent: "#059669", accentDim: "#05966912", accentMid: "#05966930",
    accent2: "#7c3aed", accent3: "#0891b2", warn: "#d97706", danger: "#dc2626",
    text: "#1a1a2e", textDim: "#6b7280", textBright: "#000", border: "#e2e2ea",
    calToday: "#05966910", calHas: "#7c3aed10",
  },
};

// ═══════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════
export default function WorkHoursApp() {
  const [theme, setTheme] = useState("dark");
  const [view, setView] = useState("log");
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [modal, setModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [filterEmp, setFilterEmp] = useState("");
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({
    employee: "", date: todayStr(), startTime: "09:00", endTime: "17:00",
    breakMin: 0, note: "", categories: ["development"], project_id: "",
    timelineContent: "", timelineFilename: "",
  });

  // Summary (AI) state
  const [summaryScope, setSummaryScope] = useState("week"); // week | month
  const [summaryResult, setSummaryResult] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryPrompt, setSummaryPrompt] = useState("");

  const T = THEMES[theme];
  const ff = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const flash = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // ── Load ──
  useEffect(() => {
    (async () => {
      const [e, p] = await Promise.all([loadStorage(ENTRIES_KEY), loadStorage(PROJECTS_KEY)]);
      setEntries(e); setProjects(p); setLoading(false);
    })();
  }, []);

  const persist = async (newE, newP) => {
    setSaving(true);
    const ok = await Promise.all([
      newE !== null ? saveStorage(ENTRIES_KEY, newE).then(() => setEntries(newE)) : Promise.resolve(),
      newP !== null ? saveStorage(PROJECTS_KEY, newP).then(() => setProjects(newP)) : Promise.resolve(),
    ]);
    setSaving(false); return true;
  };

  // ── Filtered ──
  const filtered = entries.filter(e => {
    if (filterEmp && !e.employee.toLowerCase().includes(filterEmp.toLowerCase())) return false;
    if (filterMonth && !e.date.startsWith(filterMonth)) return false;
    return true;
  });
  const employees = [...new Set(entries.map(e => e.employee))];
  const getProject = (id) => projects.find(p => p.id === id);

  // ── Entry submit ──
  const submitEntry = async () => {
    if (!form.employee.trim()) return flash("Wpisz swoje imię", "error");
    if (form.categories.length === 0) return flash("Wybierz kategorię", "error");
    if (!form.note.trim() && !form.timelineContent) return flash("Dodaj opis pracy lub załącz timeline", "error");
    if (form.startTime >= form.endTime) return flash("Godzina końca musi być późniejsza", "error");
    const minutes = calcMin(form.startTime, form.endTime, form.breakMin);
    const entry = {
      id: editingId || uid(), employee: form.employee.trim(), date: form.date,
      startTime: form.startTime, endTime: form.endTime, breakMin: form.breakMin,
      minutes, note: form.note.trim(), categories: form.categories,
      project_id: form.project_id || null,
      timelineContent: form.timelineContent || null,
      timelineFilename: form.timelineFilename || null,
      createdAt: editingId ? entries.find(x => x.id === editingId)?.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = editingId ? entries.map(x => x.id === editingId ? entry : x) : [entry, ...entries];
    await persist(updated, null);
    flash(editingId ? "Wpis zaktualizowany" : "Godziny zapisane");
    setEditingId(null);
    setForm(p => ({ ...p, date: todayStr(), startTime: "09:00", endTime: "17:00", breakMin: 0, note: "", categories: ["development"], project_id: "", timelineContent: "", timelineFilename: "" }));
  };

  const startEdit = (entry) => {
    setForm({ employee: entry.employee, date: entry.date, startTime: entry.startTime, endTime: entry.endTime, breakMin: entry.breakMin || 0, note: entry.note, categories: entry.categories || ["other"], project_id: entry.project_id || "", timelineContent: entry.timelineContent || "", timelineFilename: entry.timelineFilename || "" });
    setEditingId(entry.id); setView("log");
  };

  const doDelete = async (id) => { await persist(entries.filter(x => x.id !== id), null); flash("Wpis usunięty"); setDeleteConfirm(null); };

  // ── Project actions ──
  const saveProject = async (data) => {
    if (!data.name.trim()) return flash("Nazwa projektu wymagana", "error");
    const updated = data.id
      ? projects.map(p => p.id === data.id ? { ...p, ...data } : p)
      : [...projects, { ...data, id: uid(), archived: false }];
    await persist(null, updated);
    flash(data.id ? "Projekt zapisany" : "Projekt dodany"); setModal(null);
  };

  const toggleArchive = async (id) => {
    await persist(null, projects.map(p => p.id === id ? { ...p, archived: !p.archived } : p));
  };

  const removeProject = async (id) => { await persist(null, projects.filter(p => p.id !== id)); flash("Projekt usunięty"); };

  // ═══ STYLES ═══
  const S = {
    app: { maxWidth: 900, margin: "0 auto", padding: "20px 16px 60px", fontFamily: "'Syne',sans-serif", background: T.bg, color: T.text, minHeight: "100vh", transition: "all .25s" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 },
    h1: { fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", margin: 0 },
    sub: { fontSize: 13, color: T.textDim, marginTop: 2 },
    themeBtn: { width: 40, height: 40, borderRadius: "50%", border: `1px solid ${T.border}`, background: T.surface, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" },
    tabs: { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 20 },
    tab: (on) => ({ padding: "8px 14px", borderRadius: 10, border: `1px solid ${on ? T.accentMid : T.border}`, background: on ? T.accentDim : "transparent", color: on ? T.accent : T.textDim, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13, transition: "all .2s", display: "flex", alignItems: "center", gap: 5 }),
    card: { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 22, marginBottom: 14, transition: "all .25s" },
    cardTitle: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: T.textBright },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 },
    field: { marginTop: 12 },
    label: { display: "block", fontSize: 11, fontWeight: 600, color: T.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" },
    hint: { fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: .7 },
    input: { width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgInput, color: T.text, fontFamily: "inherit", fontSize: 14, outline: "none" },
    textarea: { width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgInput, color: T.text, fontFamily: "inherit", fontSize: 14, outline: "none", minHeight: 90, resize: "vertical" },
    btn: { padding: "10px 20px", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 },
    btnP: { padding: "10px 22px", borderRadius: 10, border: "none", background: T.accent, color: T.bg, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 },
    btnSm: { padding: "5px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 },
    btnD: { color: T.danger, borderColor: T.danger + "33" },
    btnGrp: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" },
    dur: { display: "inline-block", marginTop: 10, padding: "5px 14px", borderRadius: 8, background: T.accentDim, border: `1px solid ${T.accentMid}`, color: T.accent, fontSize: 13, fontWeight: 600 },
    catBtn: (on, c) => ({ padding: "5px 14px", borderRadius: 20, border: `1px solid ${on ? c : T.border}`, background: on ? c + "18" : "transparent", color: on ? c : T.textDim, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, transition: "all .15s" }),
    catBadge: (c) => ({ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: c + "18", color: c, display: "inline-block", margin: "1px 2px" }),
    projBadge: (c) => ({ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, border: `1px solid ${T.border}`, color: c }),
    projDot: (c) => ({ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0, display: "inline-block" }),
    statsRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 },
    statCard: { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, textAlign: "center" },
    statNum: { fontSize: 22, fontWeight: 800, color: T.accent },
    statLbl: { fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: ".06em", marginTop: 4 },
    entryCard: { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 8 },
    weekHdr: { display: "flex", justifyContent: "space-between", padding: "8px 14px", background: T.bgEl, borderRadius: 10, marginBottom: 8, fontSize: 13, fontWeight: 700 },
    empBlock: { padding: 18, background: T.bgInput, borderRadius: 14, border: `1px solid ${T.border}`, marginBottom: 12 },
    empAvatar: { width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${T.accent2}, ${T.accent})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#0a0a0f", flexShrink: 0 },
    calDay: (today, has, other) => ({ minHeight: 80, borderRadius: 10, border: `1px solid ${today ? T.accentMid : T.border}`, padding: 6, background: today ? T.calToday : has ? T.calHas : T.bgCard, cursor: other ? "default" : "pointer", opacity: other ? .25 : 1, position: "relative", overflow: "hidden", transition: "all .15s" }),
    calNum: (today) => ({ fontSize: 12, fontWeight: 700, color: today ? T.accent : T.textDim, marginBottom: 3 }),
    calMini: { fontSize: 9, color: T.textDim, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "1px 3px", borderRadius: 3, marginBottom: 1, background: T.surface },
    calTotal: { position: "absolute", bottom: 3, right: 5, fontSize: 10, fontWeight: 800, color: T.accent },
    miniEntry: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.surface}`, fontSize: 12 },
    modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
    modalBox: { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 28, maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" },
    toast: (t) => ({ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", padding: "10px 24px", borderRadius: 12, fontWeight: 700, fontSize: 13, zIndex: 999, background: t === "error" ? T.danger : T.accent, color: t === "error" ? "#fff" : T.bg, boxShadow: "0 8px 32px rgba(0,0,0,.3)" }),
    empty: { textAlign: "center", padding: "50px 20px", background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}` },
    projCard: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8, background: T.bgCard },
  };

  // ═══ VIEWS ═══

  const EntryCard = ({ e }) => {
    const proj = e.project_id ? getProject(e.project_id) : null;
    return (
      <div style={S.entryCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
              <span style={{ fontWeight: 700, color: T.textBright }}>{e.employee}</span>
              {(e.categories || []).map(c => <span key={c} style={S.catBadge(CATEGORIES[c]?.color || "#888")}>{CATEGORIES[c]?.label || c}</span>)}
              {proj && <span style={S.projBadge(proj.color)}><span style={S.projDot(proj.color)} />{proj.name}</span>}
            </div>
            <div style={{ fontSize: 12, color: T.textDim, marginBottom: 5 }}>
              {formatDate(e.date)} · {e.startTime}–{e.endTime}{e.breakMin > 0 && ` · przerwa ${e.breakMin}min`}
              {e.timelineContent && <span style={{ marginLeft: 8, color: T.accent, fontWeight: 600 }}>📎 timeline</span>}
            </div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>{e.note || (e.timelineContent ? <span style={{ color: T.textDim, fontStyle: "italic" }}>📎 Opis w załączonym timeline ({e.timelineFilename})</span> : "")}</div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.accent, minWidth: 65, textAlign: "right" }}>{formatDur(e.minutes)}</div>
        </div>
        <div style={{ ...S.btnGrp, marginTop: 8 }}>
          <button style={S.btnSm} onClick={() => startEdit(e)}>✏️ Edytuj</button>
          {e.timelineContent && <button style={{ ...S.btnSm, color: T.accent, borderColor: T.accentMid }} onClick={() => setModal({ type: "timeline", data: e })}>📎 Timeline</button>}
          <button style={{ ...S.btnSm, ...S.btnD }} onClick={() => setDeleteConfirm(e.id)}>🗑 Usuń</button>
        </div>
      </div>
    );
  };

  const LogView = () => {
    const showDur = form.startTime < form.endTime;
    const dur = showDur ? calcMin(form.startTime, form.endTime, form.breakMin) : 0;
    return (
      <div style={S.card}>
        <div style={S.cardTitle}>{editingId ? "✏️ Edycja wpisu" : "➕ Nowy wpis"}</div>
        <div style={S.grid2}>
          <div><label style={S.label}>Imię i nazwisko</label><input style={S.input} value={form.employee} onChange={e => ff("employee", e.target.value)} placeholder="Jan Kowalski" /></div>
          <div><label style={S.label}>Data</label><input type="date" style={S.input} value={form.date} onChange={e => ff("date", e.target.value)} /></div>
        </div>
        <div style={S.grid3}>
          <div><label style={S.label}>Start</label><input type="time" style={S.input} value={form.startTime} onChange={e => ff("startTime", e.target.value)} /></div>
          <div><label style={S.label}>Koniec</label><input type="time" style={S.input} value={form.endTime} onChange={e => ff("endTime", e.target.value)} /></div>
          <div><label style={S.label}>Przerwa (min)</label><input type="number" style={S.input} min="0" max="240" value={form.breakMin} onChange={e => ff("breakMin", parseInt(e.target.value) || 0)} /></div>
        </div>
        {showDur && <div style={S.dur}>Czas netto: <strong>{formatDur(dur)}</strong></div>}
        <div style={S.field}>
          <label style={S.label}>Kategorie <span style={S.hint}>(można wybrać kilka)</span></label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(CATEGORIES).map(([k, c]) => {
              const on = form.categories.includes(k);
              return <button key={k} style={S.catBtn(on, c.color)} onClick={() => ff("categories", on ? form.categories.filter(x => x !== k) : [...form.categories, k])}>{on ? "✓ " : ""}{c.icon} {c.label}</button>;
            })}
          </div>
        </div>
        <div style={S.field}>
          <label style={S.label}>Projekt <span style={S.hint}>(opcjonalnie)</span></label>
          <select style={S.input} value={form.project_id} onChange={e => ff("project_id", e.target.value)}>
            <option value="">— brak —</option>
            {projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}{p.client ? ` — ${p.client}` : ""}</option>)}
          </select>
        </div>
        <div style={S.field}>
          <label style={S.label}>Opis wykonanej pracy <span style={S.hint}>{form.timelineContent ? "(opcjonalnie — timeline załączony)" : ""}</span></label>
          <textarea style={S.textarea} value={form.note} onChange={e => ff("note", e.target.value)} placeholder={form.timelineContent ? "Timeline załączony — możesz dodać dodatkowy opis lub zostawić puste..." : "Opisz co zostało zrobione..."} />
        </div>
        <div style={S.field}>
          <label style={S.label}>Timeline / raport dzienny <span style={S.hint}>(opcjonalnie, plik .md lub .txt)</span></label>
          {form.timelineContent ? (
            <div style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.accent}44`, background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 18 }}>📎</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.timelineFilename || "timeline.md"}</div>
                  <div style={{ fontSize: 11, color: T.textDim }}>{(form.timelineContent.length / 1024).toFixed(1)} KB · {form.timelineContent.split("\n").length} linii</div>
                </div>
              </div>
              <button style={{ ...S.btnSm, ...S.btnD }} onClick={() => { ff("timelineContent", ""); ff("timelineFilename", ""); }}>✕</button>
            </div>
          ) : (
            <label style={{ display: "block", padding: "18px 14px", borderRadius: 10, border: `2px dashed ${T.border}`, textAlign: "center", cursor: "pointer", transition: "all .2s", color: T.textDim, fontSize: 13 }}>
              <input type="file" accept=".md,.txt,.markdown" style={{ display: "none" }} onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 500000) return flash("Plik za duży (max 500KB)", "error");
                const reader = new FileReader();
                reader.onload = (ev) => { ff("timelineContent", ev.target.result); ff("timelineFilename", file.name); };
                reader.readAsText(file);
              }} />
              📄 Przeciągnij lub kliknij aby załączyć plik timeline
            </label>
          )}
        </div>
        <div style={S.btnGrp}>
          <button style={S.btnP} onClick={submitEntry} disabled={saving}>{saving ? "⏳..." : editingId ? "💾 Zapisz zmiany" : "✅ Zapisz godziny"}</button>
          {editingId && <button style={S.btn} onClick={() => { setEditingId(null); setForm(p => ({ ...p, note: "", startTime: "09:00", endTime: "17:00", breakMin: 0, categories: ["development"], project_id: "", timelineContent: "", timelineFilename: "" })); }}>Anuluj</button>}
        </div>
      </div>
    );
  };

  const HistoryView = () => {
    const grouped = {};
    filtered.forEach(e => { const wk = `${e.date.slice(0, 4)}-W${String(weekNum(e.date)).padStart(2, "0")}`; (grouped[wk] = grouped[wk] || []).push(e); });
    return (
      <>
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={S.grid2}>
            <div><label style={S.label}>Filtruj po imieniu</label><input style={S.input} value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Wpisz imię..." /></div>
            <div><label style={S.label}>Miesiąc</label><input type="month" style={S.input} value={filterMonth} onChange={e => setFilterMonth(e.target.value)} /></div>
          </div>
        </div>
        {filtered.length === 0 ? <div style={S.empty}><p style={{ fontSize: 36 }}>📭</p><p style={{ color: T.textDim, marginTop: 8 }}>Brak wpisów</p></div> :
          Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([wk, items]) => (
            <div key={wk} style={{ marginBottom: 20 }}>
              <div style={S.weekHdr}><span>📅 Tydzień {wk.split("-W")[1]}</span><span style={{ color: T.accent }}>{formatDur(items.reduce((s, e) => s + e.minutes, 0))}</span></div>
              {items.sort((a, b) => b.date.localeCompare(a.date)).map(e => <EntryCard key={e.id} e={e} />)}
            </div>
          ))}
      </>
    );
  };

  const CalendarView = () => {
    const startDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
    const dim = new Date(calYear, calMonth + 1, 0).getDate();
    const td = todayStr();
    const mk = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
    const map = {};
    entries.forEach(e => { if (e.date.startsWith(mk)) (map[e.date] = map[e.date] || []).push(e); });

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(<div key={`p${i}`} style={S.calDay(false, false, true)}><div style={S.calNum(false)}>{new Date(calYear, calMonth, -startDow + i + 1).getDate()}</div></div>);
    for (let d = 1; d <= dim; d++) {
      const ds = `${mk}-${String(d).padStart(2, "0")}`;
      const de = map[ds] || [];
      const tm = de.reduce((s, e) => s + e.minutes, 0);
      cells.push(
        <div key={ds} style={S.calDay(ds === td, de.length > 0, false)} onClick={() => { ff("date", ds); setView("log"); }}>
          <div style={S.calNum(ds === td)}>{d}</div>
          {de.slice(0, 2).map((e, i) => <div key={i} style={S.calMini}>{e.employee.split(" ")[0]} {e.startTime}</div>)}
          {de.length > 2 && <div style={{ ...S.calMini, color: T.accent }}>+{de.length - 2}</div>}
          {tm > 0 && <div style={S.calTotal}>{formatDur(tm)}</div>}
        </div>
      );
    }
    const rem = (startDow + dim) % 7 === 0 ? 0 : 7 - ((startDow + dim) % 7);
    for (let i = 1; i <= rem; i++) cells.push(<div key={`n${i}`} style={S.calDay(false, false, true)}><div style={S.calNum(false)}>{i}</div></div>);

    const prev = () => { calMonth === 0 ? (setCalMonth(11), setCalYear(y => y - 1)) : setCalMonth(m => m - 1); };
    const next = () => { calMonth === 11 ? (setCalMonth(0), setCalYear(y => y + 1)) : setCalMonth(m => m + 1); };
    return (
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{MONTHS[calMonth]} {calYear}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["◀", prev], ["●", () => { setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()); }], ["▶", next]].map(([ic, fn], i) =>
              <button key={i} onClick={fn} style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{ic}</button>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: "uppercase", padding: "6px 0" }}>{d}</div>)}
          {cells}
        </div>
        <p style={{ fontSize: 11, color: T.textDim, marginTop: 12 }}>💡 Kliknij dzień aby dodać wpis</p>
      </div>
    );
  };

  const BossView = () => {
    const totalMin = filtered.reduce((s, e) => s + e.minutes, 0);
    const totalDays = new Set(filtered.map(e => e.date)).size;
    const byEmp = {};
    filtered.forEach(e => {
      if (!byEmp[e.employee]) byEmp[e.employee] = { mins: 0, days: new Set(), entries: [], catMins: {} };
      const emp = byEmp[e.employee]; emp.mins += e.minutes; emp.days.add(e.date); emp.entries.push(e);
      (e.categories || []).forEach(c => { emp.catMins[c] = (emp.catMins[c] || 0) + e.minutes / (e.categories || []).length; });
    });
    return (
      <>
        <div style={S.statsRow}>
          <div style={S.statCard}><div style={S.statNum}>{formatDur(totalMin)}</div><div style={S.statLbl}>Łączny czas</div></div>
          <div style={S.statCard}><div style={{ ...S.statNum, color: T.accent2 }}>{filtered.length}</div><div style={S.statLbl}>Wpisów</div></div>
          <div style={S.statCard}><div style={{ ...S.statNum, color: T.accent3 }}>{totalDays}</div><div style={S.statLbl}>Dni roboczych</div></div>
          <div style={S.statCard}><div style={{ ...S.statNum, color: T.warn }}>{Object.keys(byEmp).length}</div><div style={S.statLbl}>Pracowników</div></div>
        </div>
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={S.grid2}>
            <div><label style={S.label}>Pracownik</label><select style={S.input} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}><option value="">Wszyscy</option>{employees.map(e => <option key={e} value={e}>{e}</option>)}</select></div>
            <div><label style={S.label}>Miesiąc</label><input type="month" style={S.input} value={filterMonth} onChange={e => setFilterMonth(e.target.value)} /></div>
          </div>
        </div>
        {Object.keys(byEmp).length === 0 ? <div style={S.empty}><p style={{ fontSize: 36 }}>📭</p><p style={{ color: T.textDim }}>Brak danych</p></div> :
          Object.entries(byEmp).sort((a, b) => b[1].mins - a[1].mins).map(([name, d]) => {
            const init = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
            const cats = Object.entries(d.catMins).sort((a, b) => b[1] - a[1]);
            return (
              <div key={name} style={S.empBlock}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                  <div style={S.empAvatar}>{init}</div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: T.textBright }}>{name}</div><div style={{ fontSize: 12, color: T.textDim }}>{d.days.size} dni · {d.entries.length} wpisów</div></div>
                  <div style={{ textAlign: "right" }}><div style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{formatDur(d.mins)}</div><div style={{ fontSize: 11, color: T.textDim }}>śr. {d.days.size > 0 ? formatDur(Math.round(d.mins / d.days.size)) : "—"}/dzień</div></div>
                </div>
                <div style={{ display: "flex", gap: 2, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                  {cats.map(([c, min]) => <div key={c} style={{ flex: min, height: 6, borderRadius: 3, background: CATEGORIES[c]?.color || "#555", minWidth: 3 }} />)}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  {cats.map(([c, min]) => <span key={c} style={{ fontSize: 11, color: CATEGORIES[c]?.color }}>● {CATEGORIES[c]?.label} {formatDur(Math.round(min))}</span>)}
                </div>
                {d.entries.slice(0, 5).map(e => {
                  const proj = e.project_id ? getProject(e.project_id) : null;
                  return (
                    <div key={e.id} style={S.miniEntry}>
                      <span style={{ color: T.textDim, minWidth: 72 }}>{e.date}</span>
                      <span style={{ color: CATEGORIES[(e.categories || [])[0]]?.color || T.textDim, minWidth: 50 }}>{e.startTime}–{e.endTime}</span>
                      <span style={{ fontWeight: 700, color: T.accent, minWidth: 55 }}>{formatDur(e.minutes)}</span>
                      {proj && <span style={{ color: proj.color, minWidth: 50 }}>[{proj.name}]</span>}
                      {e.timelineContent && <span style={{ color: T.accent, fontSize: 10 }}>📎</span>}
                      <span style={{ color: e.note ? T.text : T.textDim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: e.note ? "normal" : "italic" }}>{e.note || (e.timelineContent ? `📎 ${e.timelineFilename}` : "—")}</span>
                    </div>
                  );
                })}
                {d.entries.length > 5 && <p style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>...i {d.entries.length - 5} więcej</p>}
              </div>
            );
          })}
      </>
    );
  };

  const ProjectsView = () => {
    const active = projects.filter(p => !p.archived), archived = projects.filter(p => p.archived);
    const PCard = ({ p }) => {
      const cnt = entries.filter(e => e.project_id === p.id).length;
      const tm = entries.filter(e => e.project_id === p.id).reduce((s, e) => s + e.minutes, 0);
      return (
        <div style={{ ...S.projCard, opacity: p.archived ? .5 : 1 }}>
          <span style={{ ...S.projDot(p.color), width: 14, height: 14 }} />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>{p.client && <div style={{ fontSize: 12, color: T.textDim }}>{p.client}</div>}</div>
          <div style={{ textAlign: "right", fontSize: 12, color: T.textDim, minWidth: 55 }}><div style={{ fontWeight: 700, color: T.accent }}>{formatDur(tm)}</div><div>{cnt} wpisów</div></div>
          <div style={{ display: "flex", gap: 4 }}>
            <button style={S.btnSm} onClick={() => setModal({ type: "project", data: { ...p } })}>✏️</button>
            <button style={S.btnSm} onClick={() => toggleArchive(p.id)}>{p.archived ? "♻️" : "📦"}</button>
            {cnt === 0 && <button style={{ ...S.btnSm, ...S.btnD }} onClick={() => removeProject(p.id)}>🗑</button>}
          </div>
        </div>
      );
    };
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>📁 Projekty</div>
          <button style={{ ...S.btnP, fontSize: 13, padding: "7px 16px" }} onClick={() => setModal({ type: "project", data: { name: "", client: "", color: "#00e5a0" } })}>+ Nowy</button>
        </div>
        {active.length === 0 && archived.length === 0 && <div style={S.empty}><p style={{ fontSize: 36 }}>📁</p><p style={{ color: T.textDim }}>Brak projektów</p></div>}
        {active.map(p => <PCard key={p.id} p={p} />)}
        {archived.length > 0 && <><div style={{ marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: 700, color: T.textDim }}>Zarchiwizowane</div>{archived.map(p => <PCard key={p.id} p={p} />)}</>}
      </>
    );
  };

  // ═══ MODALS ═══
  const ProjectModal = () => {
    const [pd, setPd] = useState(modal?.data || { name: "", client: "", color: "#00e5a0" });
    if (!modal || modal.type !== "project") return null;
    return (
      <div style={S.modal} onClick={e => e.target === e.currentTarget && setModal(null)}>
        <div style={S.modalBox}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>{pd.id ? "✏️ Edytuj projekt" : "➕ Nowy projekt"}</div>
          <div><label style={S.label}>Nazwa projektu</label><input style={S.input} value={pd.name} onChange={e => setPd(p => ({ ...p, name: e.target.value }))} placeholder="np. Redesign strony" /></div>
          <div style={S.field}><label style={S.label}>Klient <span style={S.hint}>(opcjonalnie)</span></label><input style={S.input} value={pd.client || ""} onChange={e => setPd(p => ({ ...p, client: e.target.value }))} placeholder="np. Firma XYZ" /></div>
          <div style={S.field}>
            <label style={S.label}>Kolor</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PROJECT_COLORS.map(c => <div key={c} onClick={() => setPd(p => ({ ...p, color: c }))} style={{ width: 32, height: 32, borderRadius: "50%", background: c, cursor: "pointer", border: `3px solid ${pd.color === c ? T.textBright : "transparent"}`, transition: "border .15s" }} />)}
            </div>
          </div>
          <div style={S.btnGrp}><button style={S.btnP} onClick={() => saveProject(pd)}>{pd.id ? "💾 Zapisz" : "✅ Dodaj"}</button><button style={S.btn} onClick={() => setModal(null)}>Anuluj</button></div>
        </div>
      </div>
    );
  };

  const DeleteModal = () => {
    if (!deleteConfirm) return null;
    return (
      <div style={S.modal} onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
        <div style={{ ...S.modalBox, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>🗑 Potwierdzenie</div>
          <p style={{ color: T.textDim, marginBottom: 20 }}>Czy na pewno chcesz usunąć ten wpis?</p>
          <div style={{ ...S.btnGrp, justifyContent: "center" }}>
            <button style={{ ...S.btnP, background: T.danger }} onClick={() => doDelete(deleteConfirm)}>Tak, usuń</button>
            <button style={S.btn} onClick={() => setDeleteConfirm(null)}>Anuluj</button>
          </div>
        </div>
      </div>
    );
  };

  const TimelineModal = () => {
    if (!modal || modal.type !== "timeline") return null;
    const e = modal.data;
    return (
      <div style={S.modal} onClick={ev => ev.target === ev.currentTarget && setModal(null)}>
        <div style={{ ...S.modalBox, maxWidth: 640 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>📎 {e.timelineFilename || "timeline.md"}</div>
              <div style={{ fontSize: 12, color: T.textDim }}>{e.employee} · {e.date}</div>
            </div>
            <button style={S.btnSm} onClick={() => setModal(null)}>✕ Zamknij</button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap", fontFamily: "'Space Mono', monospace", padding: "16px 18px", background: T.bgInput, borderRadius: 10, border: `1px solid ${T.border}`, maxHeight: 450, overflowY: "auto" }}>
            {e.timelineContent}
          </div>
        </div>
      </div>
    );
  };

  // ═══ AI SUMMARY VIEW ═══
  const DEFAULT_SUMMARY_PROMPT = `Jesteś asystentem tworzącym podsumowania pracy zdalnej dla szefa.

Zasady:
- Pisz po polsku, zwięźle, zrozumiale dla osoby nietechnicznej
- Grupuj zadania w szerokie kategorie (np. "Rozwój strony", "Spotkania z klientem", "Administracja")
- NIE używaj żargonu technicznego — tłumacz na język biznesowy
- Podsumuj kluczowe osiągnięcia, ile czasu na co poszło
- Jeśli są załączone timeline'y — uwzględnij szczegóły z nich, ale uprość
- Na końcu dodaj sekcję "Następne kroki" jeśli wynikają z kontekstu
- Format: Markdown z nagłówkami ## i listami

Dane do podsumowania:`;

  const generateSummary = async () => {
    const scopeEntries = filtered.filter(e => {
      if (summaryScope === "week") {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        return e.date >= weekAgo;
      }
      return e.date.startsWith(filterMonth);
    });

    if (scopeEntries.length === 0) return flash("Brak wpisów dla wybranego zakresu", "error");

    const prompt = summaryPrompt || DEFAULT_SUMMARY_PROMPT;
    const totalMin = scopeEntries.reduce((s, e) => s + e.minutes, 0);

    let dataBlock = `\n\n## Zakres: ${summaryScope === "week" ? "ostatni tydzień" : filterMonth}\n`;
    dataBlock += `## Łączny czas: ${formatDur(totalMin)}\n\n`;
    dataBlock += `### Wpisy:\n`;

    scopeEntries.sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      const proj = e.project_id ? getProject(e.project_id) : null;
      dataBlock += `\n**${e.date}** | ${e.employee} | ${e.startTime}–${e.endTime} (${formatDur(e.minutes)})`;
      dataBlock += `\nKategorie: ${(e.categories || []).map(c => CATEGORIES[c]?.label || c).join(", ")}`;
      if (proj) dataBlock += ` | Projekt: ${proj.name}`;
      dataBlock += `\nOpis: ${e.note}`;
      if (e.timelineContent) {
        dataBlock += `\n\n--- TIMELINE (${e.timelineFilename || "timeline.md"}) ---\n${e.timelineContent}\n--- KONIEC TIMELINE ---\n`;
      }
      dataBlock += "\n";
    });

    setSummaryLoading(true);
    setSummaryResult("");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt + dataBlock }],
        }),
      });
      const data = await response.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "Brak odpowiedzi";
      setSummaryResult(text);
    } catch (err) {
      flash("Błąd generowania podsumowania", "error");
      console.error(err);
    }
    setSummaryLoading(false);
  };

  const downloadSummaryMd = () => {
    if (!summaryResult) return;
    const header = `# Podsumowanie pracy — ${summaryScope === "week" ? "tydzień" : filterMonth}\n\n`;
    const blob = new Blob([header + summaryResult], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `podsumowanie-${summaryScope}-${filterMonth || todayStr()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SummaryView = () => {
    const withTimeline = entries.filter(e => e.timelineContent).length;
    return (
      <>
        <div style={S.card}>
          <div style={S.cardTitle}>🤖 Podsumowanie AI</div>
          <p style={{ fontSize: 13, color: T.textDim, marginBottom: 16, lineHeight: 1.6 }}>
            Generuje podsumowanie godzin i pracy (wraz z załączonymi timeline'ami) w formie zrozumiałej dla szefa.
            Wynik w Markdown — do pobrania jako plik <code style={{ background: T.surface, padding: "1px 5px", borderRadius: 4 }}>.md</code>
          </p>

          <div style={S.grid2}>
            <div>
              <label style={S.label}>Zakres</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[["week", "📅 Tydzień"], ["month", "🗓️ Miesiąc"]].map(([k, l]) => (
                  <button key={k} style={S.catBtn(summaryScope === k, T.accent)} onClick={() => setSummaryScope(k)}>{summaryScope === k ? "✓ " : ""}{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={S.label}>Miesiąc (dla zakresu miesięcznego)</label>
              <input type="month" style={S.input} value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
            </div>
          </div>

          <div style={S.field}>
            <label style={S.label}>Prompt <span style={S.hint}>(opcjonalnie — nadpisz domyślny)</span></label>
            <textarea style={{ ...S.textarea, minHeight: 70, fontSize: 12, fontFamily: "'Space Mono', monospace" }} value={summaryPrompt} onChange={e => setSummaryPrompt(e.target.value)} placeholder="Zostaw puste aby użyć domyślnego promptu..." />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: T.textDim }}>📊 {filtered.length} wpisów w zakresie</span>
            <span style={{ fontSize: 12, color: T.accent }}>📎 {withTimeline} z timeline</span>
          </div>

          <div style={S.btnGrp}>
            <button style={S.btnP} onClick={generateSummary} disabled={summaryLoading}>
              {summaryLoading ? "⏳ Generuję..." : "🤖 Generuj podsumowanie"}
            </button>
            {summaryResult && <button style={S.btn} onClick={downloadSummaryMd}>📥 Pobierz .md</button>}
            {summaryResult && <button style={{ ...S.btn, fontSize: 12 }} onClick={() => { navigator.clipboard.writeText(summaryResult); flash("Skopiowano!"); }}>📋 Kopiuj</button>}
          </div>
        </div>

        {summaryLoading && (
          <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>🤖</p>
            <p style={{ color: T.textDim, fontSize: 14 }}>Claude analizuje Twoje wpisy...</p>
            <div style={{ width: 200, height: 4, background: T.surface, borderRadius: 2, margin: "16px auto 0", overflow: "hidden" }}>
              <div style={{ width: "60%", height: "100%", background: T.accent, borderRadius: 2, animation: "pulse 1.5s ease-in-out infinite" }} />
            </div>
          </div>
        )}

        {summaryResult && !summaryLoading && (
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={S.cardTitle}>📝 Wynik</div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: T.text, whiteSpace: "pre-wrap", fontFamily: "inherit", padding: "16px 20px", background: T.bgInput, borderRadius: 10, border: `1px solid ${T.border}`, maxHeight: 500, overflowY: "auto" }}>
              {summaryResult}
            </div>
          </div>
        )}
      </>
    );
  };

  // ═══ RENDER ═══
  const TABS = [
    { key: "log", icon: "✏️", label: "Logowanie" },
    { key: "history", icon: "📋", label: "Historia" },
    { key: "calendar", icon: "📅", label: "Kalendarz" },
    { key: "boss", icon: "👔", label: "Szef" },
    { key: "projects", icon: "📁", label: "Projekty" },
    { key: "summary", icon: "🤖", label: "Podsumowania" },
  ];

  if (loading) return <div style={S.app}><div style={{ ...S.empty, border: "none", background: "transparent" }}><p style={{ fontSize: 32 }}>⏳</p><p style={{ color: T.textDim, marginTop: 8 }}>Ładowanie...</p></div></div>;

  return (
    <div style={S.app}>
      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}
      <ProjectModal />
      <DeleteModal />
      <TimelineModal />

      <div style={S.header}>
        <div><h1 style={S.h1}><span style={{ color: T.accent }}>⏱</span> AlphaHours</h1><p style={S.sub}>Raportowanie godzin pracy zdalnej</p></div>
        <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={S.themeBtn} title="Zmień motyw">{theme === "dark" ? "☀️" : "🌙"}</button>
      </div>

      <div style={S.tabs}>
        {TABS.map(t => <button key={t.key} style={S.tab(view === t.key)} onClick={() => setView(t.key)}>{t.icon} {t.label}</button>)}
      </div>

      {view === "log" && <LogView />}
      {view === "history" && <HistoryView />}
      {view === "calendar" && <CalendarView />}
      {view === "boss" && <BossView />}
      {view === "projects" && <ProjectsView />}
      {view === "summary" && <SummaryView />}
    </div>
  );
}
