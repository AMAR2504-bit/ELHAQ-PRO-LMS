import {
  db, collection, getDocs, addDoc, setDoc, doc, updateDoc, deleteDoc,
  query, orderBy, where, serverTimestamp, writeBatch,
} from "./firebase.js";
import { initShell, $, esc, fmtDate, fmtDateTime, asDate, toast, openModal, closeModal, formModal } from "./core.js";

/* ───────── Data ───────── */
const S = { materials: [], assignments: [], quizzes: [], keys: {}, subs: [], attempts: [], students: [], ready: false };
let CTX;

const read = async (name, ...q) =>
  (await getDocs(query(collection(db, name), ...q))).docs.map((d) => ({ id: d.id, ...d.data() }));

async function loadAll() {
  const [materials, assignments, quizzes, keys, subs, attempts, students] = await Promise.all([
    read("materials", orderBy("createdAt", "desc")),
    read("assignments", orderBy("createdAt", "desc")),
    read("quizzes", orderBy("createdAt", "desc")),
    getDocs(collection(db, "quizKeys")),
    read("submissions", orderBy("createdAt", "desc")),
    read("attempts", orderBy("createdAt", "desc")),
    read("users", where("role", "==", "siswa")),
  ]);
  Object.assign(S, { materials, assignments, quizzes, subs, attempts, students, ready: true });
  S.keys = Object.fromEntries(keys.docs.map((d) => [d.id, d.data().answers || []]));
}
const reload = async () => (await loadAll(), CTX.refresh());

/* ───── Helper ───── */
const isPending = (x) => x.status !== "graded";
const tag = (t, c = "") => `<span class="tag ${c}">${t}</span>`;
const stat = (l, v) => `<div class="card stat"><small>${l}</small><b>${v}</b></div>`;
const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
const hasEssay = (q) => q.questions.some((x) => x.type === "essay");
const empty = (t) => `<div class="empty">${t}</div>`;
const table = (heads, rows) =>
  `<div class="card flush"><table class="table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;

function quizScore(quiz, att, key, es = att.essayScores || {}) {
  let sum = 0;
  quiz.questions.forEach((q, i) => {
    sum += q.type === "pg" ? (att.answers?.[i] === key[i] ? 1 : 0) : (Number(es[i]) || 0) / 100;
  });
  return Math.round((sum / quiz.questions.length) * 100);
}

const FEEDBACK = [
  ["Kerangka 3 bagian", "Yang sudah baik: \nYang perlu ditingkatkan: \nLangkah berikutnya: "],
  ["Sangat baik", "Kerja bagus, jawabanmu tepat dan runtut. Pertahankan."],
  ["Kurang lengkap", "Jawabanmu belum lengkap. Lengkapi bagian: "],
  ["Perlu revisi", "Perlu direvisi. Perhatikan bagian: "],
];

/* ───────── Tampilan ───────── */
function dashboard() {
  const p = [
    ...S.subs.filter(isPending).map((x) => ({ ...x, k: "Tugas", title: x.assignmentTitle })),
    ...S.attempts.filter(isPending).map((x) => ({ ...x, k: "Kuis", title: x.quizTitle })),
  ].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  $("#view").innerHTML = `
    <div class="grid stats">${stat("Siswa", S.students.length)}${stat("Modul & materi", S.materials.length)}${stat("Tugas", S.assignments.length)}${stat("Kuis", S.quizzes.length)}</div>
    <div class="card">
      <div class="card-h"><h3>Menunggu pemeriksaan</h3>${p.length ? tag(p.length + " item", "warn") : ""}</div>
      ${
        p.length
          ? `<div class="list">${p
              .slice(0, 8)
              .map((x) => `<div class="li"><div><b>${esc(x.studentName)}</b><small>${x.k} · ${esc(x.title)}</small></div><small>${fmtDate(x.createdAt)}</small></div>`)
              .join("")}</div><a class="btn primary" href="#periksa">Periksa sekarang</a>`
          : empty("Semua jawaban sudah diperiksa.")
      }
    </div>`;
}

/* CRUD generik untuk Materi & Tugas */
function crud({ key, col, label, fields, cols }) {
  $("#actions").innerHTML = `<button class="btn primary" id="add">+ Tambah ${label}</button>`;
  const rows = S[key];
  $("#view").innerHTML = rows.length
    ? table(
        [...cols.map((c) => c.h), ""],
        rows
          .map(
            (r) =>
              `<tr>${cols.map((c) => `<td>${c.f(r)}</td>`).join("")}<td class="act"><button class="btn ghost sm" data-e="${r.id}">Ubah</button> <button class="btn ghost sm danger" data-d="${r.id}">Hapus</button></td></tr>`
          )
          .join("")
      )
    : empty(`Belum ada ${label}. Klik “Tambah ${label}” untuk memulai.`);

  const save = async (existing) => {
    const data = await formModal({ title: `${existing ? "Ubah" : "Tambah"} ${label}`, fields, values: existing || {} });
    if (!data) return;
    if (existing) await updateDoc(doc(db, col, existing.id), data);
    else await addDoc(collection(db, col), { ...data, createdAt: serverTimestamp() });
    toast("Tersimpan");
    reload();
  };
  $("#add").onclick = () => save();
  $("#view").onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.e) save(rows.find((r) => r.id === b.dataset.e));
    if (b.dataset.d && confirm(`Hapus ${label} ini?`)) {
      await deleteDoc(doc(db, col, b.dataset.d));
      toast("Dihapus");
      reload();
    }
  };
}

const materi = () =>
  crud({
    key: "materials", col: "materials", label: "materi",
    fields: [
      { name: "type", label: "Jenis", type: "select", options: [{ value: "modul", label: "Modul" }, { value: "materi", label: "Materi" }] },
      { name: "title", label: "Judul", required: true },
      { name: "description", label: "Deskripsi singkat", type: "textarea", rows: 2 },
      { name: "url", label: "Tautan berkas", type: "url", placeholder: "https://drive.google.com/…", hint: "Google Drive, YouTube, atau tautan lain (atur akses “siapa saja dengan tautan”)." },
      { name: "content", label: "Isi materi (opsional)", type: "textarea", rows: 6, hint: "Teks yang dibaca langsung di dalam ELPRO." },
    ],
    cols: [
      { h: "Judul", f: (r) => `<b>${esc(r.title)}</b>` },
      { h: "Jenis", f: (r) => tag(r.type === "modul" ? "Modul" : "Materi") },
      { h: "Tautan", f: (r) => (r.url ? `<a class="link" style="margin:0" href="${esc(r.url)}" target="_blank" rel="noopener">Buka ↗</a>` : "—") },
      { h: "Dibuat", f: (r) => fmtDate(r.createdAt) },
    ],
  });

const tugas = () =>
  crud({
    key: "assignments", col: "assignments", label: "tugas",
    fields: [
      { name: "title", label: "Judul tugas", required: true },
      { name: "instructions", label: "Instruksi", type: "textarea", rows: 5, required: true },
      { name: "url", label: "Tautan pendukung (opsional)", type: "url" },
      { name: "deadline", label: "Batas pengumpulan", type: "datetime-local", required: true },
      { name: "maxScore", label: "Nilai maksimal", type: "number", min: 1, value: 100, required: true },
    ],
    cols: [
      { h: "Judul", f: (r) => `<b>${esc(r.title)}</b>` },
      { h: "Batas waktu", f: (r) => fmtDateTime(r.deadline) },
      { h: "Nilai maks", f: (r) => r.maxScore },
      { h: "Terkumpul", f: (r) => S.subs.filter((s) => s.assignmentId === r.id).length + " / " + S.students.length },
    ],
  });

/* Kuis */
function kuis() {
  $("#actions").innerHTML = `<button class="btn primary" id="add">+ Buat kuis</button>`;
  $("#view").innerHTML = S.quizzes.length
    ? table(
        ["Judul", "Soal", "Dikerjakan", ""],
        S.quizzes
          .map((q) => {
            const pg = q.questions.filter((x) => x.type === "pg").length;
            return `<tr><td><b>${esc(q.title)}</b></td><td>${pg} PG${q.questions.length - pg ? ` · ${q.questions.length - pg} esai` : ""}</td><td>${S.attempts.filter((a) => a.quizId === q.id).length} / ${S.students.length}</td><td class="act"><button class="btn ghost sm" data-e="${q.id}">Ubah</button> <button class="btn ghost sm danger" data-d="${q.id}">Hapus</button></td></tr>`;
          })
          .join("")
      )
    : empty("Belum ada kuis. Klik “Buat kuis” untuk menyusun soal.");
  $("#add").onclick = () => quizBuilder();
  $("#view").onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.e) quizBuilder(S.quizzes.find((q) => q.id === b.dataset.e));
    if (b.dataset.d && confirm("Hapus kuis ini beserta kunci jawabannya?")) {
      await deleteDoc(doc(db, "quizzes", b.dataset.d));
      await deleteDoc(doc(db, "quizKeys", b.dataset.d));
      toast("Dihapus");
      reload();
    }
  };
}

function quizBuilder(ex) {
  const blank = (type = "pg") => ({ type, q: "", options: ["", "", "", ""], a: 0 });
  const qs = ex ? ex.questions.map((q, i) => ({ ...blank(q.type), ...q, a: S.keys[ex.id]?.[i] ?? 0 })) : [blank()];
  if (ex && S.attempts.some((a) => a.quizId === ex.id) && !confirm("Kuis ini sudah dikerjakan siswa. Mengubah soal dapat membuat penilaian lama tidak sesuai. Lanjutkan?")) return;

  const sheet = openModal(
    `<h3>${ex ? "Ubah" : "Buat"} kuis</h3>
     <label class="field"><span>Judul kuis</span><input id="qt" value="${esc(ex?.title || "")}"></label>
     <label class="field"><span>Deskripsi / petunjuk</span><input id="qd" value="${esc(ex?.description || "")}"></label>
     <div id="qs"></div>
     <div class="row"><button type="button" class="btn sm" data-add="pg">+ Pilihan ganda</button><button type="button" class="btn sm" data-add="essay">+ Esai</button></div>
     <div class="row end"><button type="button" class="btn ghost" data-x>Batal</button><button type="button" class="btn primary" id="sv">Simpan kuis</button></div>`,
    { wide: true }
  );
  const paint = () => {
    $("#qs", sheet).innerHTML = qs
      .map((q, i) => {
        const pg = q.type === "pg";
        return `<div class="qb"><div class="qb-h"><b>Soal ${i + 1}</b>${tag(pg ? "Pilihan ganda" : "Esai", pg ? "" : "warn")}<button type="button" class="btn ghost sm danger" data-del="${i}">Hapus</button></div>
          <textarea data-i="${i}" data-f="q" rows="2" placeholder="Tulis pertanyaan">${esc(q.q)}</textarea>
          ${
            pg
              ? `<div style="margin-top:10px">${q.options
                  .map((o, j) => `<div class="opt"><input type="radio" name="a${i}" data-i="${i}" data-f="a" value="${j}" ${q.a === j ? "checked" : ""}><input data-i="${i}" data-o="${j}" value="${esc(o)}" placeholder="Pilihan ${"ABCD"[j]}"></div>`)
                  .join("")}<small>Pilih lingkaran untuk menandai jawaban yang benar.</small></div>`
              : ""
          }</div>`;
      })
      .join("");
  };
  paint();
  sheet.addEventListener("input", (e) => {
    const t = e.target, i = t.dataset.i;
    if (i == null) return;
    if (t.dataset.f === "q") qs[i].q = t.value;
    else if (t.dataset.f === "a") qs[i].a = Number(t.value);
    else if (t.dataset.o != null) qs[i].options[t.dataset.o] = t.value;
  });
  sheet.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.add) (qs.push(blank(b.dataset.add)), paint());
    if (b.dataset.del != null) (qs.splice(Number(b.dataset.del), 1), paint());
    if (b.dataset.x != null) closeModal();
  });
  $("#sv", sheet).onclick = async () => {
    const title = $("#qt", sheet).value.trim();
    if (!title) return toast("Judul kuis wajib diisi", "bad");
    if (!qs.length) return toast("Tambahkan minimal satu soal", "bad");
    const bad = qs.findIndex((q) => !q.q.trim() || (q.type === "pg" && q.options.some((o) => !o.trim())));
    if (bad >= 0) return toast(`Soal ${bad + 1} belum lengkap`, "bad");
    const payload = {
      title,
      description: $("#qd", sheet).value.trim(),
      questions: qs.map((q) =>
        q.type === "pg" ? { type: "pg", q: q.q.trim(), options: q.options.map((o) => o.trim()) } : { type: "essay", q: q.q.trim() }
      ),
    };
    const answers = qs.map((q) => (q.type === "pg" ? q.a : null));
    if (ex) {
      await updateDoc(doc(db, "quizzes", ex.id), payload);
      await setDoc(doc(db, "quizKeys", ex.id), { answers });
    } else {
      const ref = await addDoc(collection(db, "quizzes"), { ...payload, createdAt: serverTimestamp() });
      await setDoc(doc(db, "quizKeys", ref.id), { answers });
    }
    closeModal();
    toast("Kuis tersimpan");
    reload();
  };
}

/* Periksa jawaban */
const RV = { kind: "tugas", item: "", status: "pending" };

function periksa() {
  const isT = RV.kind === "tugas";
  const idKey = isT ? "assignmentId" : "quizId";
  const titles = isT ? S.assignments : S.quizzes;
  const list = (isT ? S.subs : S.attempts).filter(
    (x) =>
      (!RV.item || x[idKey] === RV.item) &&
      (RV.status === "all" || (RV.status === "pending" ? isPending(x) : !isPending(x)))
  );
  const autoable = list.filter((a) => {
    const q = S.quizzes.find((z) => z.id === a.quizId);
    return !isT && isPending(a) && q && !hasEssay(q);
  });
  $("#view").innerHTML = `
    <div class="toolbar">
      <div class="seg"><button data-k="tugas" class="${isT ? "on" : ""}">Tugas</button><button data-k="kuis" class="${isT ? "" : "on"}">Kuis</button></div>
      <select id="fi"><option value="">Semua ${isT ? "tugas" : "kuis"}</option>${titles.map((t) => `<option value="${t.id}" ${RV.item === t.id ? "selected" : ""}>${esc(t.title)}</option>`).join("")}</select>
      <select id="fs">${[["pending", "Belum dinilai"], ["done", "Sudah dinilai"], ["all", "Semua"]].map(([v, l]) => `<option value="${v}" ${RV.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      ${autoable.length ? `<button class="btn" id="auto">Nilai otomatis (${autoable.length} kuis PG)</button>` : ""}
    </div>
    ${
      list.length
        ? table(
            ["Siswa", isT ? "Tugas" : "Kuis", "Dikirim", "Status", ""],
            list
              .map(
                (x, i) =>
                  `<tr><td><b>${esc(x.studentName)}</b></td><td>${esc(isT ? x.assignmentTitle : x.quizTitle)}</td><td>${fmtDateTime(x.createdAt)}</td><td>${
                    isPending(x) ? tag("Menunggu", "warn") : tag("Nilai " + x.score, "ok")
                  }</td><td class="act"><button class="btn sm ${isPending(x) ? "primary" : ""}" data-r="${i}">${isPending(x) ? "Periksa" : "Lihat"}</button></td></tr>`
              )
              .join("")
          )
        : empty("Tidak ada data untuk filter ini.")
    }`;
  $("#view").onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.k) ((RV.kind = b.dataset.k), (RV.item = ""), periksa());
    if (b.dataset.r != null) (isT ? reviewTugas : reviewKuis)(list, Number(b.dataset.r));
    if (b.id === "auto" && confirm(`Nilai otomatis ${autoable.length} jawaban kuis pilihan ganda?`)) {
      const batch = writeBatch(db);
      autoable.slice(0, 450).forEach((a) => {
        const q = S.quizzes.find((z) => z.id === a.quizId);
        batch.update(doc(db, "attempts", a.id), { score: quizScore(q, a, S.keys[q.id] || []), status: "graded", gradedAt: serverTimestamp() });
      });
      await batch.commit();
      toast("Selesai dinilai otomatis");
      reload();
    }
  };
  $("#fi").onchange = (e) => ((RV.item = e.target.value), periksa());
  $("#fs").onchange = (e) => ((RV.status = e.target.value), periksa());
}

function chipsHtml() {
  return `<div class="chips">${FEEDBACK.map(([l], i) => `<button type="button" data-c="${i}">${l}</button>`).join("")}</div>`;
}
function wireChips(sheet) {
  sheet.querySelectorAll("[data-c]").forEach(
    (b) =>
      (b.onclick = () => {
        const fb = $("#fb", sheet);
        fb.value = (fb.value ? fb.value + "\n" : "") + FEEDBACK[b.dataset.c][1];
        fb.focus();
      })
  );
}
const finish = (go, list, i, fn) => (go && i + 1 < list.length ? fn(list, i + 1) : (closeModal(), CTX.refresh()));

function reviewTugas(list, i) {
  const s = list[i];
  const a = S.assignments.find((x) => x.id === s.assignmentId);
  const max = a?.maxScore ?? 100;
  const late = a?.deadline && asDate(s.createdAt) > new Date(a.deadline);
  const sheet = openModal(
    `<div class="rv-h"><div><h3>${esc(s.studentName)}</h3><small>${esc(s.assignmentTitle)} · ${fmtDateTime(s.createdAt)} ${late ? tag("Terlambat", "bad") : ""}</small></div><span class="count">${i + 1} / ${list.length}</span></div>
     <div class="answer">${s.answer ? esc(s.answer) : "<i>(tidak ada jawaban teks)</i>"}</div>
     ${s.link ? `<a class="link" href="${esc(s.link)}" target="_blank" rel="noopener">Buka tautan jawaban ↗</a>` : ""}
     <div class="grade">
       <label class="field"><span>Nilai (0–${max})</span><input id="sc" type="number" min="0" max="${max}" value="${s.score ?? ""}"></label>
       <label class="field"><span>Umpan balik</span><textarea id="fb" rows="4">${esc(s.feedback || "")}</textarea></label>
     </div>${chipsHtml()}
     <div class="row end"><button class="btn ghost" data-x>Tutup</button><button class="btn" id="s1">Simpan</button><button class="btn primary" id="s2">Simpan & lanjut</button></div>`,
    { wide: true }
  );
  wireChips(sheet);
  $("[data-x]", sheet).onclick = () => (closeModal(), CTX.refresh());
  const save = async (go) => {
    const v = Number($("#sc", sheet).value);
    if ($("#sc", sheet).value === "" || !(v >= 0 && v <= max)) return toast(`Nilai harus 0–${max}`, "bad");
    const upd = { score: v, max, feedback: $("#fb", sheet).value.trim(), status: "graded" };
    await updateDoc(doc(db, "submissions", s.id), { ...upd, gradedAt: serverTimestamp() });
    Object.assign(s, upd);
    toast("Nilai tersimpan");
    finish(go, list, i, reviewTugas);
  };
  $("#s1", sheet).onclick = () => save(false);
  $("#s2", sheet).onclick = () => save(true);
}

function reviewKuis(list, i) {
  const at = list[i];
  const qz = S.quizzes.find((x) => x.id === at.quizId);
  if (!qz) return toast("Kuis sudah dihapus", "bad");
  const key = S.keys[qz.id] || [];
  const es = { ...(at.essayScores || {}) };
  const body = qz.questions
    .map((q, n) => {
      const ans = at.answers?.[n];
      if (q.type === "pg")
        return `<div class="qb"><b>${n + 1}. ${esc(q.q)}</b>${q.options
          .map((o, j) => `<div class="opt ${j === key[n] ? "good" : j === ans ? "wrong" : ""}">${"ABCD"[j]}. ${esc(o)} ${j === key[n] ? "✓" : j === ans ? "✗ (jawaban siswa)" : ""}</div>`)
          .join("")}${ans == null ? "<small>Tidak dijawab</small>" : ""}</div>`;
      return `<div class="qb"><b>${n + 1}. ${esc(q.q)}</b><div class="answer">${ans ? esc(ans) : "<i>(kosong)</i>"}</div><label class="field" style="max-width:180px;margin:0"><span>Nilai esai (0–100)</span><input type="number" min="0" max="100" data-es="${n}" value="${es[n] ?? ""}"></label></div>`;
    })
    .join("");
  const sheet = openModal(
    `<div class="rv-h"><div><h3>${esc(at.studentName)}</h3><small>${esc(at.quizTitle)} · ${fmtDateTime(at.createdAt)}</small></div><span class="count">${i + 1} / ${list.length}</span></div>
     ${body}
     <p class="live">Nilai akhir: <b id="tot"></b></p>
     <label class="field"><span>Umpan balik</span><textarea id="fb" rows="3">${esc(at.feedback || "")}</textarea></label>${chipsHtml()}
     <div class="row end"><button class="btn ghost" data-x>Tutup</button><button class="btn" id="s1">Simpan</button><button class="btn primary" id="s2">Simpan & lanjut</button></div>`,
    { wide: true }
  );
  wireChips(sheet);
  const total = () => ($("#tot", sheet).textContent = quizScore(qz, at, key, es));
  total();
  sheet.addEventListener("input", (e) => {
    if (e.target.dataset.es != null) ((es[e.target.dataset.es] = e.target.value), total());
  });
  $("[data-x]", sheet).onclick = () => (closeModal(), CTX.refresh());
  const save = async (go) => {
    const upd = { score: quizScore(qz, at, key, es), essayScores: es, feedback: $("#fb", sheet).value.trim(), status: "graded" };
    await updateDoc(doc(db, "attempts", at.id), { ...upd, gradedAt: serverTimestamp() });
    Object.assign(at, upd);
    toast("Nilai tersimpan");
    finish(go, list, i, reviewKuis);
  };
  $("#s1", sheet).onclick = () => save(false);
  $("#s2", sheet).onclick = () => save(true);
}

/* Siswa */
function siswa() {
  const rows = S.students.map((u) => {
    const t = avg(S.subs.filter((s) => s.uid === u.id && s.status === "graded").map((s) => (s.score / (s.max || 100)) * 100));
    const k = avg(S.attempts.filter((s) => s.uid === u.id && s.status === "graded").map((s) => s.score));
    return { u, t, k };
  });
  $("#actions").innerHTML = rows.length ? `<button class="btn" id="csv">Ekspor CSV</button>` : "";
  $("#view").innerHTML = rows.length
    ? table(
        ["Nama", "Email", "Bergabung", "Rata-rata tugas", "Rata-rata kuis"],
        rows.map(({ u, t, k }) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${fmtDate(u.createdAt)}</td><td>${t ?? "—"}</td><td>${k ?? "—"}</td></tr>`).join("")
      )
    : empty("Belum ada siswa yang mendaftar. Bagikan alamat situs ELPRO kepada siswa.");
  if (rows.length)
    $("#csv").onclick = () => {
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [["Nama", "Email", "Rata-rata tugas", "Rata-rata kuis"], ...rows.map(({ u, t, k }) => [u.name, u.email, t, k])].map((r) => r.map(q).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
      a.download = "nilai-elpro.csv";
      a.click();
    };
}

/* ───────── Mulai ───────── */
const V = { dashboard, materi, tugas, kuis, periksa, siswa };
initShell({
  role: "admin",
  items: [
    { id: "dashboard", label: "Ringkasan", icon: "home" },
    { id: "materi", label: "Modul & Materi", icon: "book" },
    { id: "tugas", label: "Tugas", icon: "task" },
    { id: "kuis", label: "Kuis & Soal", icon: "quiz" },
    { id: "periksa", label: "Periksa Jawaban", icon: "check" },
    { id: "siswa", label: "Siswa & Nilai", icon: "users" },
  ],
  render: async (id, ctx) => {
    CTX = ctx;
    if (!S.ready) await loadAll();
    V[id]();
  },
});
