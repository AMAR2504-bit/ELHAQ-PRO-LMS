import { db, collection, getDocs, setDoc, doc, query, orderBy, where, serverTimestamp } from "./firebase.js";
import { initShell, $, esc, fmtDate, fmtDateTime, asDate, toast, openModal, closeModal } from "./core.js";

const S = { materials: [], assignments: [], quizzes: [], subs: {}, atts: {}, ready: false };
let CTX;

const read = async (name, ...q) =>
  (await getDocs(query(collection(db, name), ...q))).docs.map((d) => ({ id: d.id, ...d.data() }));

async function loadAll() {
  const uid = CTX.user.uid;
  const [materials, assignments, quizzes, subs, atts] = await Promise.all([
    read("materials", orderBy("createdAt", "desc")),
    read("assignments", orderBy("createdAt", "desc")),
    read("quizzes", orderBy("createdAt", "desc")),
    read("submissions", where("uid", "==", uid)),
    read("attempts", where("uid", "==", uid)),
  ]);
  Object.assign(S, { materials, assignments, quizzes, ready: true });
  S.subs = Object.fromEntries(subs.map((s) => [s.assignmentId, s]));
  S.atts = Object.fromEntries(atts.map((a) => [a.quizId, a]));
}
const reload = async () => (await loadAll(), CTX.refresh());

const tag = (t, c = "") => `<span class="tag ${c}">${t}</span>`;
const empty = (t) => `<div class="empty">${t}</div>`;
const stat = (l, v, extra = "") => `<div class="card stat"><small>${l}</small><b>${v}</b>${extra}</div>`;
const bar = (p) => `<div class="bar"><i style="width:${p}%"></i></div>`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const isLate = (a, s) => a.deadline && asDate(s?.createdAt || new Date()) > new Date(a.deadline);

function statusOf(item, kind) {
  if (!item) return tag("Belum dikerjakan", "mute");
  if (item.status !== "graded") return tag("Menunggu penilaian", "warn");
  return tag(kind === "tugas" ? `Nilai ${item.score}/${item.max || 100}` : `Nilai ${item.score}`, "ok");
}

function allScores() {
  return [
    ...Object.values(S.subs).filter((s) => s.status === "graded").map((s) => pct(s.score, s.max || 100)),
    ...Object.values(S.atts).filter((a) => a.status === "graded").map((a) => a.score),
  ];
}

/* ───────── Tampilan ───────── */
function beranda() {
  const first = CTX.profile.name.split(" ")[0];
  const sc = allScores();
  const avg = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : "—";
  const doneT = S.assignments.filter((a) => S.subs[a.id]).length;
  const doneK = S.quizzes.filter((q) => S.atts[q.id]).length;
  const todo = S.assignments
    .filter((a) => !S.subs[a.id])
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 4);
  $("#view").innerHTML = `
    <p style="font-size:18px;margin:-8px 0 20px">Halo, <b>${esc(first)}</b>. Mari lanjutkan belajar hari ini.</p>
    <div class="grid stats">
      ${stat("Tugas terkumpul", `${doneT}/${S.assignments.length}`, bar(pct(doneT, S.assignments.length)))}
      ${stat("Kuis dikerjakan", `${doneK}/${S.quizzes.length}`, bar(pct(doneK, S.quizzes.length)))}
      ${stat("Rata-rata nilai", avg)}
    </div>
    <div class="card">
      <div class="card-h"><h3>Tugas yang perlu dikerjakan</h3><a class="btn sm" href="#tugas">Semua tugas</a></div>
      ${
        todo.length
          ? `<div class="list">${todo
              .map((a) => `<div class="li"><div><b>${esc(a.title)}</b><small>Batas: ${fmtDateTime(a.deadline)}</small></div>${isLate(a) ? tag("Lewat batas", "bad") : tag("Aktif")}</div>`)
              .join("")}</div>`
          : empty("Tidak ada tugas yang tertunda. Kerja bagus!")
      }
    </div>`;
}

function materi() {
  $("#view").innerHTML = S.materials.length
    ? `<div class="grid cards">${S.materials
        .map(
          (m) => `<div class="card item"><div>${tag(m.type === "modul" ? "Modul" : "Materi")}</div><h3>${esc(m.title)}</h3><p>${esc(m.description || "")}</p>
          <div class="row">${m.content ? `<button class="btn sm primary" data-r="${m.id}">Baca</button>` : ""}${m.url ? `<a class="btn sm" href="${esc(m.url)}" target="_blank" rel="noopener">Buka berkas ↗</a>` : ""}</div></div>`
        )
        .join("")}</div>`
    : empty("Belum ada materi. Guru akan segera mengunggahnya.");
  $("#view").onclick = (e) => {
    const b = e.target.closest("[data-r]");
    if (!b) return;
    const m = S.materials.find((x) => x.id === b.dataset.r);
    const sheet = openModal(
      `${tag(m.type === "modul" ? "Modul" : "Materi")}<h3 style="margin-top:10px">${esc(m.title)}</h3><div class="answer" style="max-height:none;background:#fff;border:0;padding:0">${esc(m.content)}</div><div class="row end"><button class="btn" data-x>Tutup</button></div>`,
      { wide: true }
    );
    $("[data-x]", sheet).onclick = closeModal;
  };
}

function tugas() {
  $("#view").innerHTML = S.assignments.length
    ? `<div class="grid cards">${S.assignments
        .map((a) => {
          const s = S.subs[a.id];
          return `<div class="card item"><div class="row between">${statusOf(s, "tugas")}${!s && isLate(a) ? tag("Lewat batas", "bad") : ""}</div><h3>${esc(a.title)}</h3><p>Batas: ${fmtDateTime(a.deadline)}</p><div class="row"><button class="btn sm ${s ? "" : "primary"}" data-a="${a.id}">${s ? "Lihat" : "Kerjakan"}</button></div></div>`;
        })
        .join("")}</div>`
    : empty("Belum ada tugas.");
  $("#view").onclick = (e) => {
    const b = e.target.closest("[data-a]");
    if (b) openTugas(S.assignments.find((a) => a.id === b.dataset.a));
  };
}

function openTugas(a) {
  const s = S.subs[a.id];
  const sheet = openModal(
    `<h3>${esc(a.title)}</h3><small>Batas: ${fmtDateTime(a.deadline)} · Nilai maks ${a.maxScore}</small>
     <div class="answer" style="margin-top:14px">${esc(a.instructions)}</div>
     ${a.url ? `<a class="link" href="${esc(a.url)}" target="_blank" rel="noopener">Tautan pendukung ↗</a>` : ""}
     ${
       s
         ? `<h3 style="font-size:16px;margin:8px 0">Jawaban Anda</h3><div class="answer">${s.answer ? esc(s.answer) : "<i>(tautan saja)</i>"}</div>${s.link ? `<a class="link" href="${esc(s.link)}" target="_blank" rel="noopener">Tautan jawaban ↗</a>` : ""}
            <p>${statusOf(s, "tugas")}</p>${s.feedback ? `<div class="answer" style="background:var(--soft);border:0;margin-top:10px"><b>Umpan balik guru</b>\n${esc(s.feedback)}</div>` : ""}
            <div class="row end"><button class="btn" data-x>Tutup</button></div>`
         : `<form><label class="field" style="margin-top:12px"><span>Jawaban</span><textarea name="answer" rows="6" placeholder="Tulis jawabanmu di sini"></textarea></label>
            <label class="field"><span>Tautan jawaban (opsional)</span><input name="link" type="url" placeholder="https://drive.google.com/…"><small>Untuk berkas/foto: unggah ke Google Drive, lalu tempel tautannya.</small></label>
            <div class="row end"><button type="button" class="btn ghost" data-x>Batal</button><button class="btn primary">Kumpulkan</button></div></form>`
     }`,
    { wide: true }
  );
  $("[data-x]", sheet).onclick = closeModal;
  const form = $("form", sheet);
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const answer = f.get("answer").trim(), link = f.get("link").trim();
    if (!answer && !link) return toast("Isi jawaban atau tautan terlebih dahulu", "bad");
    if (isLate(a) && !confirm("Batas waktu sudah lewat. Tetap kumpulkan?")) return;
    e.submitter.disabled = true;
    try {
      await setDoc(doc(db, "submissions", `${CTX.user.uid}_${a.id}`), {
        assignmentId: a.id, assignmentTitle: a.title, uid: CTX.user.uid, studentName: CTX.profile.name,
        answer, link, status: "submitted", createdAt: serverTimestamp(),
      });
      closeModal();
      toast("Tugas terkumpul");
      reload();
    } catch (err) {
      console.error(err);
      toast("Gagal mengumpulkan. Coba lagi.", "bad");
      e.submitter.disabled = false;
    }
  };
}

function kuis() {
  $("#view").innerHTML = S.quizzes.length
    ? `<div class="grid cards">${S.quizzes
        .map((q) => {
          const t = S.atts[q.id];
          return `<div class="card item"><div>${statusOf(t, "kuis")}</div><h3>${esc(q.title)}</h3><p>${q.questions.length} soal${q.description ? " · " + esc(q.description) : ""}</p>${
            t ? "" : `<div class="row"><button class="btn sm primary" data-q="${q.id}">Mulai kuis</button></div>`
          }</div>`;
        })
        .join("")}</div>`
    : empty("Belum ada kuis.");
  $("#view").onclick = (e) => {
    const b = e.target.closest("[data-q]");
    if (b) takeQuiz(S.quizzes.find((q) => q.id === b.dataset.q));
  };
}

function takeQuiz(q) {
  const sheet = openModal(
    `<form><h3>${esc(q.title)}</h3><small>${esc(q.description || "")} Kuis hanya dapat dikerjakan satu kali.</small><div style="margin-top:14px">${q.questions
      .map(
        (x, i) =>
          `<div class="qb"><b>${i + 1}. ${esc(x.q)}</b>${
            x.type === "pg"
              ? x.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}"><span>${"ABCD"[j]}. ${esc(o)}</span></label>`).join("")
              : `<textarea name="q${i}" rows="4" placeholder="Tulis jawabanmu"></textarea>`
          }</div>`
      )
      .join("")}</div><div class="row end"><button type="button" class="btn ghost" data-x>Batal</button><button class="btn primary">Kumpulkan</button></div></form>`,
    { wide: true }
  );
  $("[data-x]", sheet).onclick = closeModal;
  const form = $("form", sheet);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const answers = q.questions.map((x, i) => {
      const v = f.get("q" + i);
      return x.type === "pg" ? (v == null ? null : Number(v)) : (v || "").trim();
    });
    const blank = answers.filter((a) => a === null || a === "").length;
    if (!confirm(blank ? `${blank} soal belum dijawab. Tetap kumpulkan?` : "Kumpulkan jawaban sekarang?")) return;
    e.submitter.disabled = true;
    try {
      await setDoc(doc(db, "attempts", `${CTX.user.uid}_${q.id}`), {
        quizId: q.id, quizTitle: q.title, uid: CTX.user.uid, studentName: CTX.profile.name,
        answers, status: "submitted", createdAt: serverTimestamp(),
      });
      closeModal();
      toast("Jawaban terkirim");
      reload();
    } catch (err) {
      console.error(err);
      toast("Gagal mengirim. Coba lagi.", "bad");
      e.submitter.disabled = false;
    }
  };
}

function nilai() {
  const rows = [
    ...Object.values(S.subs).map((s) => ({ k: "Tugas", t: s.assignmentTitle, s, v: s.status === "graded" ? `${s.score}/${s.max || 100}` : null })),
    ...Object.values(S.atts).map((a) => ({ k: "Kuis", t: a.quizTitle, s: a, v: a.status === "graded" ? a.score : null })),
  ].sort((a, b) => (b.s.createdAt?.seconds || 0) - (a.s.createdAt?.seconds || 0));
  $("#view").innerHTML = rows.length
    ? `<div class="card flush"><table class="table"><thead><tr><th>Jenis</th><th>Judul</th><th>Dikirim</th><th>Nilai</th><th>Umpan balik</th></tr></thead><tbody>${rows
        .map((r) => `<tr><td>${tag(r.k)}</td><td><b>${esc(r.t)}</b></td><td>${fmtDate(r.s.createdAt)}</td><td>${r.v != null ? `<b>${r.v}</b>` : tag("Menunggu", "warn")}</td><td style="white-space:pre-wrap;min-width:220px">${esc(r.s.feedback || "—")}</td></tr>`)
        .join("")}</tbody></table></div>`
    : empty("Belum ada tugas atau kuis yang dikumpulkan.");
}

/* ───────── Mulai ───────── */
const V = { beranda, materi, tugas, kuis, nilai };
initShell({
  role: "siswa",
  items: [
    { id: "beranda", label: "Beranda", icon: "home" },
    { id: "materi", label: "Modul & Materi", icon: "book" },
    { id: "tugas", label: "Tugas", icon: "task" },
    { id: "kuis", label: "Kuis", icon: "quiz" },
    { id: "nilai", label: "Nilai Saya", icon: "chart" },
  ],
  render: async (id, ctx) => {
    CTX = ctx;
    if (!S.ready) await loadAll();
    V[id]();
  },
});
