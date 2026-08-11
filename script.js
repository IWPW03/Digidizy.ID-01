/* =========================================================
   WID Inventory — Drink Store
   Vanilla JavaScript (no framework)
   ========================================================= */

/* URL Google Apps Script yang menjadi sumber data.
   Ganti nilai konstanta ini dengan URL Web App Anda. */
const API_URL = "https://script.google.com/macros/s/AKfycbzKFLnMqtdO3XGDjZRgMOSPMqhmzojIHvv9_HN2wwoDGvndnRqRFREOlE1UraTKwWzO4A/exec";

/* Penanganan error agar aplikasi tidak crash saat API bermasalah */
const SafeState = {
  products: [],
  materials: [],
};

/* =========================================================
   Utilitas
   ========================================================= */

/* Ambil elemen dengan aman (mengembalikan null jika tidak ada) */
const $ = (id) => document.getElementById(id);

/* Format angka ke format rupiah, mis. Rp 12.000 */
function formatRupiah(value) {
  const n = Number(value) || 0;
  return "Rp " + n.toLocaleString("id-ID");
}

/* Escape teks agar aman dimasukkan ke innerHTML */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";

  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* Normalisasi nama field yang mungkin berbeda dari API */
function pick(obj, keys, fallback = "") {
  if (!obj) return fallback;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return fallback;
}

/* =========================================================
   Status banner (loading & error)
   ========================================================= */

function showLoading(msg = "Memuat data...") {
  const b = $("statusBanner");
  if (!b) return;
  b.hidden = false;
  b.className = "status-banner loading";
  b.textContent = msg;
}

function showError(msg) {
  const b = $("statusBanner");
  if (!b) return;
  b.hidden = false;
  b.className = "status-banner error";
  b.textContent =
    msg || "Gagal mengambil data dari server. Silakan coba lagi.";
}

function hideStatus() {
  const b = $("statusBanner");
  if (!b) return;
  b.hidden = true;
  b.className = "status-banner";
  b.textContent = "";
}

/* =========================================================
   Fetch data dari API
   Membangun URL: API_URL + ?action=...
   ========================================================= */

/* Wrapper fetch dengan penanganan error terpusat.
   Selalu mengembalikan array (kosong jika gagal). */
async function fetchAction(action) {
  const sep = API_URL.includes("?") ? "&" : "?";
  const url = `${API_URL}${sep}action=${action}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  // Beberapa Apps Script mengembalikan { data: [...] } atau [...] langsung.
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray((data.rows))) return data.rows;
  if (data && Array.isArray((data[action]))) return data[action];
  return [];
}

/* Ambil data produk dari API.
   Endpoint: ?action=produk */
async function getProducts() {
  try {
    const rows = await fetchAction("produk");
    // Normalisasi tiap baris agar field konsisten di seluruh UI
    SafeState.products = rows.map((r) => ({
      kode: pick(r, ["kode", "Kode", "code", "id", "ID"], ""),
      nama: pick(r, ["nama", "Nama", "produk", "Produk", "name"], "Tanpa Nama"),
     harga: pick(r, [
  "Harga Jual",
  "hargaJual",
  "harga",
  "Harga",
  "price",
  "Price"
], 0),
      status: pick(r, ["status", "Status", "aktif", "Aktif"], ""),
    }));
    return SafeState.products;
  } catch (err) {
    console.error("getProducts gagal:", err);
    SafeState.products = [];
    return [];
  }
}

/* Ambil data bahan dari API.
   Endpoint: ?action=bahan */
async function getMaterials() {
  try {
    const rows = await fetchAction("bahan");
    // Normalisasi tiap baris bahan
    SafeState.materials = rows.map((r) => {
      const stok = Number(pick(r, [
  "Stok Saat Ini",
  "stokSaatIni",
  "stok",
  "Stok",
  "jumlah",
  "Jumlah",
  "qty",
  "stock"
], 0)) || 0;

const min = Number(pick(r, [
  "Minimum Stok",
  "minimumStok",
  "minStok",
  "minimum",
  "min",
  "batasMinimum"
], 0)) || 0;
      return {
        kode: pick(r, ["kode", "Kode", "code", "id", "ID"], ""),
        nama: pick(r, ["nama", "Nama", "bahan", "Bahan", "name"], "Tanpa Nama"),
        satuan: pick(r, ["satuan", "Satuan", "unit"], ""),
        stok,
        minimum: min,
      };
    });
    return SafeState.materials;
  } catch (err) {
    console.error("getMaterials gagal:", err);
    SafeState.materials = [];
    return [];
  }
}

/* =========================================================
   Render: Produk
   ========================================================= */

function isProdukAktif(p) {
  const s = String(p.status || "").toLowerCase();
  if (!s) return true; // bila status kosong, anggap aktif
  // anggap non-aktif jika nilainya negatif
  return !["nonaktif", "non-aktif", "tidak aktif", "inactive", "off", "0", "false"].includes(s);
}

function produkStatusBadge(p) {
  const aktif = isProdukAktif(p);
  const label = aktif ? "Aktif" : "Nonaktif";
  const cls = aktif ? "badge badge-ok" : "badge badge-off";
  return `<span class="${cls}">${label}</span>`;
}

function renderProdukTable(products, tbodyId, countId) {
  const tbody = $(tbodyId);
  const countEl = $(countId);
  if (!tbody) return;

  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-cell">Belum ada data produk.</td></tr>`;
    if (countEl) countEl.textContent = "0 produk";
    return;
  }

  tbody.innerHTML = products
    .map(
      (p) => `
      <tr>
        <td class="kode">${escapeHtml(p.kode)}</td>
        <td>${escapeHtml(p.nama)}</td>
        <td class="td-right">${formatRupiah(p.harga)}</td>
        <td class="td-center">${produkStatusBadge(p)}</td>
      </tr>`
    )
    .join("");

  if (countEl) countEl.textContent = `${products.length} produk`;
}

/* =========================================================
   Render: Bahan & Stok Menipis
   ========================================================= */

function isStokMenipis(m) {
  // stok saat ini <= minimum stok
  return Number(m.stok) <= Number(m.minimum);
}

function bahanStatusBadge(m) {
  if (isStokMenipis(m)) {
    return `<span class="badge badge-warn">Menipis</span>`;
  }
  return `<span class="badge badge-ok">Aman</span>`;
}

function renderBahanTable(materials, tbodyId, countId) {
  const tbody = $(tbodyId);
  const countEl = $(countId);
  if (!tbody) return;

  if (!materials.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">Belum ada data bahan.</td></tr>`;
    if (countEl) countEl.textContent = "0 bahan";
    return;
  }

  tbody.innerHTML = materials
    .map((m) => {
      const satuan = m.satuan ? ` ${escapeHtml(m.satuan)}` : "";
      return `
      <tr>
        <td class="kode">${escapeHtml(m.kode)}</td>
        <td>${escapeHtml(m.nama)}</td>
        <td class="td-right">${m.stok}${escapeHtml(satuan)}</td>
        <td class="td-right">${m.minimum}${escapeHtml(satuan)}</td>
        <td class="td-center">${bahanStatusBadge(m)}</td>
      </tr>`;
    })
    .join("");

  if (countEl) countEl.textContent = `${materials.length} bahan`;
}

function renderLowStockList(materials) {
  const list = $("lowStockList");
  const count = $("lowCount");
  if (!list) return;

  const lowItems = materials.filter(isStokMenipis);

  if (count) count.textContent = `${lowItems.length} item`;

  if (!materials.length) {
    list.innerHTML = `<li class="stock-empty">Belum ada data bahan.</li>`;
    return;
  }

  if (!lowItems.length) {
    list.innerHTML = `<li class="stock-empty">Semua bahan aman. Tidak ada stok menipis.</li>`;
    return;
  }

  list.innerHTML = lowItems
    .map((m) => {
      const satuan = m.satuan ? ` ${escapeHtml(m.satuan)}` : "";
      return `
      <li class="stock-row is-low">
        <div class="stock-info">
          <span class="stock-name">${escapeHtml(m.nama)}</span>
          <span class="stock-meta">Stok: ${m.stok}${satuan} • Min: ${m.minimum}${satuan}</span>
        </div>
        <span class="stock-badge">Restok</span>
      </li>`;
    })
    .join("");
}

/* =========================================================
   Render: Penjualan Hari Ini
   Untuk tahap ini ditampilkan Rp 0.
   Struktur dibuat agar nantinya bisa ambil dari API.
   ========================================================= */

async function getTodaySales() {
  // TODO: hubungkan ke endpoint penjualan saat tersedia,
  // mis. ?action=penjualan&tanggal=hari_ini
  // Sementara kembalikan 0.
  return 0;
}

function renderSales(total) {
  const amountEl = $("salesAmount");
  const cardValue = $("penjualanHariIni");
  const dateEl = $("salesDate");

  const txt = formatRupiah(total);
  if (amountEl) amountEl.textContent = txt;
  if (cardValue) cardValue.textContent = txt;

  if (dateEl) {
    const today = new Date();
    dateEl.textContent = today.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }
}

/* =========================================================
   Dashboard
   ========================================================= */

/* Muat seluruh data dan render dashboard */
async function loadDashboard() {
  showLoading("Memuat data...");

  // Ambil data secara paralel agar lebih cepat
  const [products, materials, sales] = await Promise.all([
    getProducts(),
    getMaterials(),
    getTodaySales(),
  ]);

  // Jika kedua sumber data kosong DAN tidak ada error sebelumnya,
  // tampilkan pesan error generik (kemungkinan API belum dikonfigurasi).
  const apiNotConfigured =
    !API_URL || API_URL === "MASUKKAN_URL_APPS_SCRIPT_DI_SINI";

  if (apiNotConfigured) {
    showError(
      "URL API belum dikonfigurasi. Silakan ganti nilai API_URL di script.js."
    );
  } else if (!products.length && !materials.length) {
    showError();
  } else {
    hideStatus();
  }

  // Hitung total produk aktif
  const totalProduk = products.filter(isProdukAktif).length;
  const totalBahan = materials.length;
  const totalMenipis = materials.filter(isStokMenipis).length;

  // Isi kartu dashboard
  setText("totalProduk", totalProduk);
  setText("totalBahan", totalBahan);
  setText("stokMenipis", totalMenipis);
  renderSales(sales);

  // Render daftar stok menipis
  renderLowStockList(materials);

  // Render tabel produk (dashboard + halaman produk)
  renderProdukTable(products, "produkTbody", "produkCount");
  renderProdukTable(products, "produkTbody2", "produkCount2");

  // Render tabel bahan (halaman bahan)
  renderBahanTable(materials, "bahanTbody", "bahanCount");
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

/* =========================================================
   Navigasi antar view
   ========================================================= */

const VIEW_META = {
  dashboard: { title: "Dashboard", subtitle: "Selamat datang di WID Inventory" },
  produk: { title: "Produk", subtitle: "Daftar produk yang Anda jual" },
  bahan: { title: "Bahan", subtitle: "Daftar bahan dan stok" },
  pembelian: { title: "Pembelian", subtitle: "Pencatatan pembelian bahan" },
  penjualan: { title: "Penjualan", subtitle: "Pencatatan transaksi penjualan" },
  laporan: { title: "Laporan", subtitle: "Rekap dan ringkasan" },
};

function switchView(view) {
  if (!VIEW_META[view]) view = "dashboard";

  // Tukar panel aktif
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const panel = $(`view-${view}`);
  if (panel) panel.classList.add("active");

  // Update header
  const meta = VIEW_META[view];
  setText("pageTitle", meta.title);
  setText("pageSubtitle", meta.subtitle);

  // Update aktif state pada nav sidebar & bottom nav
  document
    .querySelectorAll(".nav-item, .bn-item")
    .forEach((n) => n.classList.remove("active"));
  document
    .querySelectorAll(`[data-view="${view}"]`)
    .forEach((n) => n.classList.add("active"));

  // Tutup menu mobile bila terbuka
  closeMobileMenu();

  // Update hash URL
  if (location.hash !== `#${view}`) {
    history.replaceState(null, "", `#${view}`);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   Mobile menu
   ========================================================= */

function openMobileMenu() {
  $("sidebar")?.classList.add("open");
  $("overlay")?.classList.add("active");
  $("menuToggle")?.classList.add("active");
  $("menuToggle")?.setAttribute("aria-expanded", "true");
}

function closeMobileMenu() {
  $("sidebar")?.classList.remove("open");
  $("overlay")?.classList.remove("active");
  $("menuToggle")?.classList.remove("active");
  $("menuToggle")?.setAttribute("aria-expanded", "false");
}

function toggleMobileMenu() {
  const sb = $("sidebar");
  if (sb && sb.classList.contains("open")) closeMobileMenu();
  else openMobileMenu();
}

/* =========================================================
   Inisialisasi
   ========================================================= */

function bindEvents() {
  // Navigasi sidebar (desktop)
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchView(item.dataset.view);
    });
  });

  // Navigasi bottom (mobile)
  document.querySelectorAll(".bn-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchView(item.dataset.view);
    });
  });

  // Tombol menu mobile
  $("menuToggle")?.addEventListener("click", toggleMobileMenu);
  $("overlay")?.addEventListener("click", closeMobileMenu);

  // Tutup menu saat resize ke desktop
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) closeMobileMenu();
  });

  // Navigasi via hash (refresh / link langsung)
  window.addEventListener("hashchange", () => {
    const view = (location.hash || "#dashboard").replace("#", "");
    switchView(view);
  });
}

/* Entry point — dijalankan saat DOM siap */
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();

  // Tentukan view awal dari hash URL
  const initialView = (location.hash || "#dashboard").replace("#", "");
  switchView(initialView);

  // Muat data dashboard
  loadDashboard();
});
