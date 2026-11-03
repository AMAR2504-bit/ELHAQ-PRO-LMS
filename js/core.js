import { auth, db, onAuthStateChanged, signOut, doc, getDoc } from "./firebase.js";

export const $ = (s, r = document) => r.querySelector(s);

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const toDate = (t) => (t?.toDate ? t.toDate() : t ? new Date(t) : null);
export const fmtDate = (t) => {
  const d = toDate(t);
  return d && !isNaN(d) ? d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
};
export const fmtDateTime = (t) => {
  const d = toDate(t);
  return d && !isNaN(d)
    ? d.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
};
export const asDate = toDate;

const P = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  book: '<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h12"/>',
  task: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};
export const icon = (n) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[n] || ""}</svg>`;

export function toast(msg, type = "ok") {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  ($("#toasts") || document.body).append(t);
  setTimeout(() => t.classList.add("out"), 2600);
  setTimeout(() => t.remove(), 3000);
}

export function openModal(html, { wide = false } = {}) {
  closeModal();
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `<div class="sheet ${wide ? "wide" : ""}">${html}</div>`;
  m.addEventListener("mousedown", (e) => e.target === m && closeModal());
  document.body.append(m);
  document.body.classList.add("noscroll");
  return m.firstElementChild;
}
export function closeModal() {
  document.querySelectorAll(".modal").forEach((m) => m.remove());
  document.body.classList.remove("noscroll");
}

export function formModal({ title, fields, values = {}, submitLabel = "Simpan" }) {
  return new Promise((resolve) => {
    const body = fields
      .map((f) => {
        const v = values[f.name] ?? f.value ?? "";
        const req = f.required ? "required" : "";
        let input;
        if (f.type === "textarea")
          input = `<textarea name="${f.name}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || "")}" ${req}>${esc(v)}</textarea>`;
        else if (f.type === "select")
          input = `<select name="${f.name}">${f.options
            .map((o) => `<option value="${esc(o.value)}" ${o.value === v ? "selected" : ""}>${esc(o.label)}</option>`)
            .join("")}</select>`;
        else
          input = `<input name="${f.name}" type="${f.type || "text"}" value="${esc(v)}" placeholder="${esc(f.placeholder || "")}" ${req} ${
            f.min != null ? `min="${f.min}"` : ""
          }>`;
        return `<label class="field"><span>${f.label}</span>${input}${f.hint ? `<small>${f.hint}</small>` : ""}</label>`;
      })
      .join("");
    const sheet = openModal(
      `<form><h3>${title}</h3>${body}<div class="row end"><button type="button" class="btn ghost" data-x>Batal</button><button class="btn primary">${submitLabel}</button></div></form>`
    );
    const form = sheet.querySelector("form");
    sheet.querySelector("[data-x]").onclick = () => (closeModal(), resolve(null));
    form.onsubmit = (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      fields.forEach((f) => f.type === "number" && (data[f.name] = Number(data[f.name])));
      closeModal();
      resolve(data);
    };
  });
}

export async function logout() {
  await signOut(auth);
  location.replace("index.html");
}

function guard(role) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) return location.replace("index.html");
      const s = await getDoc(doc(db, "users", u.uid));
      if (!s.exists()) {
        await signOut(auth);
        return location.replace("index.html");
      }
      const profile = s.data();
      if (profile.role !== role) return location.replace(profile.role === "admin" ? "admin.html" : "student.html");
      resolve({ user: u, profile });
    });
  });
}

export async function initShell({ role, items, render }) {
  const { user, profile } = await guard(role);
  $("#me").innerHTML = `<b>${esc(profile.name)}</b><span>${role === "admin" ? "Guru · Admin" : "Siswa"}</span>`;
  const nav = $("#nav");
  nav.innerHTML = items.map((i) => `<a href="#${i.id}" data-id="${i.id}">${icon(i.icon)}<span>${i.label}</span></a>`).join("");
  $("#logout").onclick = logout;
  const ctx = { user, profile };
  const go = async () => {
    const item = items.find((i) => i.id === location.hash.slice(1)) || items[0];
    nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.id === item.id));
    $("#title").textContent = item.label;
    $("#actions").innerHTML = "";
    $("#view").innerHTML = '<div class="loading">Memuat…</div>';
    try {
      await render(item.id, ctx);
    } catch (e) {
      console.error(e);
      $("#view").innerHTML = `<div class="empty">Terjadi kesalahan: ${esc(e.message)}</div>`;
    }
  };
  ctx.refresh = go;
  addEventListener("hashchange", go);
  await go();
  return ctx;
}
