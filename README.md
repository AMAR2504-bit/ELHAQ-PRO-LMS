# ELPRO — El'Haq Academic & Skills Platform

LMS berbasis website (HTML + CSS + JavaScript) dengan Firebase (Auth + Firestore), di-host di Vercel, kode di GitHub. Tanpa build step.

## Struktur

```
elpro/
├── index.html          # Masuk & daftar
├── admin.html          # Panel guru
├── student.html        # Panel siswa
├── css/style.css       # Seluruh tampilan
├── js/
│   ├── config.js       # ← isi konfigurasi Firebase di sini
│   ├── firebase.js     # Inisialisasi Firebase (CDN)
│   ├── core.js         # Helper bersama: guard login, modal, toast, shell
│   ├── index.js        # Logika masuk/daftar
│   ├── admin.js        # Materi, tugas, kuis, periksa jawaban, siswa
│   └── student.js      # Materi, tugas, kuis, nilai
├── firestore.rules     # Aturan keamanan database
├── firebase.json       # (opsional) deploy rules via Firebase CLI
└── vercel.json         # Header keamanan
```

## Model data (Firestore)

| Koleksi | Isi | Akses |
|---|---|---|
| `users/{uid}` | name, email, role (`admin`/`siswa`) | pemilik & admin |
| `materials` | title, type, description, url, content | baca: semua; tulis: admin |
| `assignments` | title, instructions, url, deadline, maxScore | baca: semua; tulis: admin |
| `quizzes` | title, description, questions[] (tanpa kunci) | baca: semua; tulis: admin |
| `quizKeys/{quizId}` | answers[] (kunci jawaban) | **admin saja** |
| `submissions/{uid_assignmentId}` | jawaban tugas + nilai | pemilik & admin; nilai: admin |
| `attempts/{uid_quizId}` | jawaban kuis + nilai | pemilik & admin; nilai: admin |

## Langkah pemasangan

### 1. Firebase
1. Buka [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
3. **Build → Firestore Database → Create database** (mode production, pilih region terdekat, mis. `asia-southeast2` Jakarta).
4. **Firestore → Rules** → tempel isi `firestore.rules` → **Publish**.
5. **Project settings → Your apps → Web (`</>`)** → daftarkan aplikasi → salin objek `firebaseConfig` ke `js/config.js`.

### 2. Jadikan akun Anda sebagai admin (guru)
1. Buka situs, **Daftar** dengan akun Anda (akan berperan `siswa` terlebih dahulu).
2. Firebase Console → **Firestore → koleksi `users`** → buka dokumen akun Anda → ubah field `role` dari `siswa` menjadi `admin`.
3. Keluar lalu masuk kembali → Anda diarahkan ke panel admin.

Pendaftar baru selalu `siswa`; aturan keamanan mencegah siapa pun mengubah perannya sendiri.

### 3. GitHub
```bash
cd elpro
git init && git add . && git commit -m "ELPRO: versi awal"
git branch -M main
git remote add origin https://github.com/<username>/elpro.git
git push -u origin main
```

### 4. Vercel
1. [vercel.com](https://vercel.com) → **Add New → Project** → impor repo `elpro`.
2. Framework Preset: **Other**. Build Command & Output Directory: kosongkan. → **Deploy**.
3. Setiap `git push` ke `main` otomatis terdeploy.

### 5. Izinkan domain Vercel di Firebase
Firebase Console → **Authentication → Settings → Authorized domains → Add domain** → tambahkan `nama-proyek.vercel.app` (dan domain kustom bila ada). Tanpa ini, login gagal di situs live.

## Cara kerja fitur utama

- **Materi & modul:** guru mengisi judul, tautan (Google Drive/YouTube) dan/atau teks isi. Tautan dipakai karena Firebase Storage kini membutuhkan paket berbayar; Firestore cukup di paket gratis.
- **Tugas:** batas waktu, nilai maksimal; siswa mengirim teks dan/atau tautan jawaban (satu kali).
- **Kuis:** pilihan ganda + esai. Kunci jawaban disimpan terpisah di `quizKeys` sehingga tidak bisa dibaca siswa.
- **Periksa jawaban cepat:** tab Tugas/Kuis, filter “Belum dinilai”, tombol **Simpan & lanjut** langsung membuka jawaban berikutnya, kuis pilihan ganda murni dapat **dinilai otomatis sekaligus**, dan tersedia kerangka umpan balik 3 bagian (yang sudah baik / yang perlu ditingkatkan / langkah berikutnya).
- **Ekspor nilai:** Siswa & Nilai → Ekspor CSV.

## Catatan & pengembangan lanjut

- Penilaian kuis dilakukan guru di panel admin (bukan di browser siswa) agar kunci jawaban aman. Bila ingin nilai kuis langsung muncul untuk siswa, tambahkan Cloud Functions (paket Blaze).
- Untuk kelas/rombel terpisah, tambahkan field `kelas` pada `users`, `materials`, `assignments`, `quizzes` lalu filter di sisi klien dan di rules.
- `apiKey` Firebase untuk web memang publik; keamanan data dijaga oleh `firestore.rules`.
