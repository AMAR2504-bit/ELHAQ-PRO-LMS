import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, signOut, doc, getDoc, setDoc, serverTimestamp,
} from "./firebase.js";

const $ = (s) => document.querySelector(s);
const say = (t, ok = false) => {
  $("#msg").textContent = t;
  $("#msg").className = "msg " + (ok ? "ok" : "bad");
};
const ERR = {
  "auth/invalid-credential": "Email atau kata sandi salah.",
  "auth/wrong-password": "Email atau kata sandi salah.",
  "auth/user-not-found": "Email atau kata sandi salah.",
  "auth/invalid-email": "Format email tidak valid.",
  "auth/email-already-in-use": "Email sudah terdaftar. Silakan masuk.",
  "auth/weak-password": "Kata sandi terlalu lemah (minimal 6 karakter).",
  "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi beberapa saat.",
  "auth/network-request-failed": "Koneksi internet bermasalah.",
};
const fail = (e) => say(ERR[e.code] || "Terjadi kesalahan. Coba lagi.");

let busy = false;
async function go(user) {
  const s = await getDoc(doc(db, "users", user.uid));
  if (!s.exists()) {
    await signOut(auth);
    return say("Profil akun tidak ditemukan.");
  }
  location.replace(s.data().role === "admin" ? "admin.html" : "student.html");
}
onAuthStateChanged(auth, (u) => u && !busy && go(u).catch(fail));

document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
      $("#login").hidden = b.dataset.tab !== "login";
      $("#register").hidden = b.dataset.tab !== "register";
      say("");
    })
);

$("#login").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.submitter;
  btn.disabled = busy = true;
  try {
    const c = await signInWithEmailAndPassword(auth, f.get("email").trim(), f.get("password"));
    await go(c.user);
  } catch (err) {
    fail(err);
  } finally {
    btn.disabled = busy = false;
  }
};

$("#register").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (f.get("password") !== f.get("confirm")) return say("Konfirmasi kata sandi tidak cocok.");
  const name = f.get("name").trim();
  const email = f.get("email").trim();
  const btn = e.submitter;
  btn.disabled = busy = true;
  try {
    const c = await createUserWithEmailAndPassword(auth, email, f.get("password"));
    await updateProfile(c.user, { displayName: name });
    await setDoc(doc(db, "users", c.user.uid), { name, email, role: "siswa", createdAt: serverTimestamp() });
    location.replace("student.html");
  } catch (err) {
    fail(err);
    btn.disabled = busy = false;
  }
};

$("#forgot").onclick = async () => {
  const email = $("#login [name=email]").value.trim();
  if (!email) return say("Isi email terlebih dahulu, lalu klik “Lupa kata sandi?”.");
  try {
    await sendPasswordResetEmail(auth, email);
    say("Tautan atur ulang kata sandi telah dikirim ke email Anda.", true);
  } catch (err) {
    fail(err);
  }
};
