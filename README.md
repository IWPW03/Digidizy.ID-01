# WID Inventory — Drink Store

Aplikasi dashboard inventory sederhana untuk pemilik usaha kecil minuman
(es teh, teh poci, minuman kekinian, kedai minuman). Menampilkan ringkasan
produk, bahan, stok menipis, dan penjualan hari ini.

## Fungsi Aplikasi

- **Dashboard** — ringkasan: Total Produk, Total Bahan, Penjualan Hari Ini,
  Stok Menipis, tabel produk, dan daftar bahan dengan stok menipis.
- **Produk** — daftar produk dengan kode, nama, harga, dan status.
- **Bahan** — daftar bahan beserta stok, minimum, dan status (Aman/Menipis).
- **Pembelian / Penjualan / Laporan** — halaman placeholder untuk modul
  berikutnya.

Data produk dan bahan diambil dari API (Google Apps Script), bukan ditulis
statis di HTML.

## Teknologi

- HTML5 (semantic HTML)
- CSS3 (custom, tanpa framework)
- Vanilla JavaScript (menggunakan `fetch()`)

Tidak menggunakan React, Vue, Angular, Bootstrap, Tailwind, atau framework
frontend lainnya.

## Cara Menjalankan

1. Pastikan Google Apps Script Web App sudah dideploy dan URL-nya sudah
   diizinkan untuk diakses.
2. Ganti nilai `API_URL` di `script.js` (lihat bagian berikutnya).
3. Buka `index.html` di browser, atau jalankan server statik sederhana:

   ```bash
   # Python
   python3 -m http.server 8000
   ```

   lalu buka `http://localhost:8000`.

> Catatan: `fetch()` ke Google Apps Script memerlukan server (bukan
> `file://`) agar CORS berjalan baik. Disarankan gunakan server statik.

## Cara Mengganti API URL

Buka `script.js` dan ubah konstanta di bagian atas file:

```javascript
const API_URL = "MASUKKAN_URL_APPS_SCRIPT_DI_SINI";
```

Ganti dengan URL Web App Anda, contoh:

```javascript
const API_URL = "https://script.google.com/macros/s/AKfyc.../exec";
```

### Endpoint yang digunakan

| Endpoint              | Data          |
| --------------------- | ------------- |
| `?action=produk`      | Daftar produk |
| `?action=bahan`       | Daftar bahan  |

Format respons yang didukung oleh aplikasi:

- Array langsung: `[ ... ]`
- Objek dengan `data`: `{ "data": [ ... ] }`
- Objek dengan `rows`: `{ "rows": [ ... ] }`

### Field yang diharapkan

**Produk** (`?action=produk`): `kode`, `nama`, `harga`, `status`
(status opsional; `Aktif`/`Nonaktif`).

**Bahan** (`?action=bahan`): `kode`, `nama`, `satuan` (opsional),
`stok`, `minimum` (minimum stok). Bahan dianggap **menipis** bila
`stok <= minimum`.

## Penyelesaian Masalah (Troubleshooting)

Jika dashboard menampilkan pesan **"Gagal mengambil data dari server"**
dan di console muncul **`Uncaught SyntaxError: Unexpected end of input`**,
penyebabnya hampir selalu **deployment Google Apps Script belum di-set ke
akses publik**, sehingga endpoint mengembalikan halaman login HTML (bukan
JSON). Browser mencoba mengeksekusi HTML tersebut sebagai JavaScript lewat
tag `<script>` JSONP → muncul SyntaxError tersebut (itu berasal dari
resource API, bukan dari `script.js`).

Langkah perbaikan di sisi Google Apps Script:

1. Buka project Apps Script → **Deploy** → **Manage deployments**.
2. Pilih deployment → **Edit** (ikon pensil).
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. **Deploy** → salin URL Web App baru.
5. Perbarui `API_URL` di `script.js` dengan URL tersebut.
6. Muat ulang halaman (atau klik tombol **Coba lagi** di banner error).

## Catatan

- Aplikasi menggunakan **JSONP** (tag `<script>`) untuk mengambil data
  dari Google Apps Script, karena `fetch()` biasa terkena batasan CORS.
  Karena itu, `doGet` di Apps Script harus membungkus respons dalam
  callback, contoh:
  `return ContentService.createTextOutput(callback + "(" + JSON.stringify({success:true, data:rows}) + ")");`
- Nilai **Penjualan Hari Ini** untuk tahap ini menampilkan `Rp 0` bila
  belum ada data penjualan dari API (lihat fungsi `getSales()` di `script.js`).
- Tidak ada kredensial atau rahasia yang disimpan di repository.
