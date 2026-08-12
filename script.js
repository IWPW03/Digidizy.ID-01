
/* =========================================================
   WID Inventory — Drink Store
   Frontend: Vanilla JavaScript
   Backend : Google Apps Script
   Database: Google Spreadsheet

   Catatan:
   - GET menggunakan JSONP agar tidak terkena CORS GitHub Pages.
   - POST akan kita aktifkan setelah GET sudah stabil.
========================================================= */


/* =========================================================
   1. KONFIGURASI API
========================================================= */

const API_URL =
  "https://script.google.com/macros/s/AKfycbwhalH-jN7xme5y_P5PDOIYA05zBsyxrdxqZOxYNasF2-w9ft8E93bOc6aM2_vRyYpPIw/exec";


/* =========================================================
   2. STATE APLIKASI
========================================================= */

const SafeState = {
  products: [],
  materials: [],
  purchases: [],
  sales: [],
  transactions: [],
  /* Melacak apakah ada error saat mengakses API,
     agar dashboard bisa menampilkan pesan yang benar
     (bukan menuduh "data kosong" padahal sebenarnya gagal). */
  lastErrors: [],
};


/* =========================================================
   3. UTILITAS
========================================================= */

/* Ambil element berdasarkan ID */
const $ = (id) => document.getElementById(id);


/* Set text dengan aman */
function setText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent = value;
  }
}


/* Format angka */
function formatNumber(value) {
  const n = Number(value) || 0;

  return n.toLocaleString("id-ID");
}


/* Format Rupiah */
function formatRupiah(value) {
  const n = Number(value) || 0;

  return "Rp " + n.toLocaleString("id-ID");
}


/* Escape HTML */
function escapeHtml(value) {

  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* Ambil field dari object dengan beberapa kemungkinan nama */
function pick(obj, keys, fallback = "") {

  if (!obj) {
    return fallback;
  }

  for (const key of keys) {

    if (
      obj[key] !== undefined &&
      obj[key] !== null &&
      obj[key] !== ""
    ) {
      return obj[key];
    }

  }

  return fallback;
}


/* =========================================================
   4. STATUS BANNER
========================================================= */

/* Render banner + (opsional) tombol "Coba lagi" */
function renderBanner(type, message, showRetry) {
  const banner = $("statusBanner");
  if (!banner) return;
  banner.hidden = false;
  banner.className = "status-banner " + type;
  banner.textContent = message || "";

  if (showRetry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Coba lagi";
    btn.className = "retry-btn";
    btn.addEventListener("click", () => {
      banner.removeChild(btn);
      loadDashboard();
    });
    banner.appendChild(btn);
  }
}

function showLoading(message = "Memuat data...") {
  renderBanner("loading", message, false);
}

function showError(message, showRetry) {
  renderBanner(
    "error",
    message || "Gagal mengambil data dari server. Silakan coba lagi.",
    showRetry !== false
  );
}

function hideStatus() {
  const banner = $("statusBanner");
  if (!banner) return;
  banner.hidden = true;
  banner.className = "status-banner";
  banner.textContent = "";
}


/* =========================================================
   5. API JSONP
=========================================================

   Kenapa JSONP?

   GitHub Pages
        ↓
   fetch()
        ↓
   Google Apps Script
        ↓
   CORS ERROR

   JSONP menggunakan <script> sehingga tidak terkena
   pembatasan CORS seperti fetch().
========================================================= */

/* Cache promise per-action agar request yang dipanggil
   bersamaan (mis. loadDashboard + switchView) tidak
   mengirim fetch ganda ke endpoint yang sama. Apps Script
   membangkitkan user_content_key sekali pakai per request
   /exec; fetch ganda ke redirect-URL yang sama -> 404. */
const _fetchCache = new Map();

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 900;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchAction(action) {

  if (_fetchCache.has(action)) {
    return _fetchCache.get(action);
  }

  const p = fetchActionInner(action).finally(() => {
    _fetchCache.delete(action);
  });

  _fetchCache.set(action, p);
  return p;
}

async function fetchActionInner(action) {

  if (!API_URL) {
    throw new Error("API_URL belum dikonfigurasi.");
  }

  const separator =
    API_URL.includes("?") ? "&" : "?";
  const fetchUrl =
    API_URL +
    separator +
    "action=" +
    encodeURIComponent(action);

  let lastErr = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {

    try {

      const res = await fetch(fetchUrl, { method: "GET" });

      const ct =
        (res.headers.get("content-type") || "")
          .toLowerCase();

      const isHtml =
        ct.includes("text/html") ||
        ct.includes("application/xhtml");

      if (isHtml || !res.ok) {
        const err = new Error(
          "Endpoint '" + action +
            "' mengembalikan halaman login/error (status " +
            res.status + "). Pastikan Google Apps Script " +
            "sudah di-deploy dengan akses 'Anyone' (anonim)."
        );
        err.status = res.status;
        err.transient =
          res.status === 404 ||
          res.status === 429 ||
          res.status >= 500;
        throw err;
      }

      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(
          "Respons '" + action +
            "' bukan JSON yang valid. Periksa format " +
            "output doGet di Apps Script."
        );
      }

      return normalizeResponse(data, action);

    } catch (err) {

      if (
        err instanceof TypeError &&
        /fetch|network|load failed/i.test(err.message)
      ) {
        return jsonpFetch(action);
      }

      lastErr = err;

      if (err.transient && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      throw err;
    }
  }

  throw lastErr;
}

/* Normalisasi berbagai format respons API menjadi array. */
function normalizeResponse(response, action) {

  if (response && Array.isArray(response.data)) {
    return response.data;
  }

  if (response && Array.isArray(response.rows)) {
    return response.rows;
  }

  if (
    response &&
    Array.isArray(response[action])
  ) {
    return response[action];
  }

  if (Array.isArray(response)) {
    return response;
  }

  return [];
}


/* Fallback JSONP untuk kasus CORS ketat. */
function jsonpFetch(action) {

  return new Promise((resolve, reject) => {

    const callbackName =
      "widCallback_" +
      Date.now() +
      "_" +
      Math.floor(Math.random() * 100000);

    const script =
      document.createElement("script");

    const separator =
      API_URL.includes("?")
        ? "&"
        : "?";

    const url =
      API_URL +
      separator +
      "action=" +
      encodeURIComponent(action) +
      "&callback=" +
      encodeURIComponent(callbackName);

    let selesai = false;

    function cleanup() {

      if (selesai) {
        return;
      }

      selesai = true;

      try {
        delete window[callbackName];
      } catch (error) {
        window[callbackName] = undefined;
      }

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[callbackName] = function(response) {

      cleanup();

      console.log(
        "[WID API/JSONP]",
        action,
        response
      );

      if (!response) {

        reject(new Error("Response API kosong."));

        return;
      }

      if (response.success === false) {

        reject(
          new Error(
            response.message ||
            "API mengembalikan error."
          )
        );

        return;
      }

      resolve(normalizeResponse(response, action));
    };

    script.onerror = function() {

      cleanup();

      reject(
        new Error(
          "Tidak dapat mengambil data dari API (" +
            action +
            "). Pastikan Google Apps Script sudah di-deploy " +
            "dengan akses 'Anyone' (anonim)."
        )
      );
    };

    script.src = url;

    document.body.appendChild(script);

    setTimeout(() => {

      if (!selesai) {

        cleanup();

        reject(
          new Error("API timeout: " + action)
        );

      }

    }, 15000);

  });
}


/* =========================================================
   5b. POST ACTION (tulis data ke API)
=========================================================

   Apps Script Web App umumnya menerima POST dengan CORS
   yang longgar (menerima dari domain mana pun). Kita kirim
   JSON lewat fetch() dengan method POST. Jika server
   memerlukan text/plain (umum untuk Apps Script), kita pakai
   Content-Type text/plain agar tidak memicu preflight.

   Format payload yang dikirim:
     { action:"penjualan", data:{...} }
     { action:"pembelian", data:{...} }

   Backend doGet/doPost di Apps Script bertanggung jawab:
     - menulis baris baru ke sheet terkait,
     - membuat header kolom otomatis bila sheet masih kosong,
     - mengupdate rolling stok bahan/produk.
========================================================= */

function postAction(payload) {

  return new Promise((resolve, reject) => {

    if (!API_URL) {
      reject(new Error("API_URL belum dikonfigurasi."));
      return;
    }

    const body = JSON.stringify(payload);

    fetch(API_URL, {
      method: "POST",
      /* text/plain menghindari preflight CORS pada Apps Script.
         redirect:follow agar fetch mengikuti 302 dari
         script.google.com ke script.googleusercontent.com
         (yang mengembalikan JSON asli). */
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body
    })
      .then((res) => {

        const ct =
          (res.headers.get("content-type") || "")
            .toLowerCase();

        /* Apps Script mengembalikan JSON (application/json atau
           text/plain) setelah redirect. Bila ternyata HTML,
           kemungkinan redirect tidak diikuti / auth wall. */
        if (ct.includes("text/html")) {
          throw new Error(
            "Server mengembalikan halaman (bukan JSON). " +
              "Pastikan Apps Script di-deploy akses 'Anyone'."
          );
        }

        return res.text();

      })
      .then((text) => {

        let data;

        try {
          data = JSON.parse(text);
        } catch (e) {
          /* Teks non-JSON (mis. "OK") -> anggap sukses. */
          resolve({ success: true, raw: text });
          return;
        }

        if (data && data.success === false) {
          reject(
            new Error(data.message || "API menolak data.")
          );
          return;
        }

        resolve(data || { success: true });

      })
      .catch((err) => {

        reject(
          new Error(
            "Gagal mengirim data ke server: " +
              (err && err.message ? err.message : "network error")
          )
        );

      });

  });
}


/* =========================================================
   6. GET PRODUK
========================================================= */

async function getProducts() {

  try {

    const rows =
      await fetchAction("produk");


    SafeState.products =
      rows.map((row) => {

        return {

          kode: pick(
            row,
            [
              "ID",
              "id",
              "Kode",
              "kode",
              "code"
            ],
            ""
          ),

          nama: pick(
            row,
            [
              "Nama Produk",
              "namaProduk",
              "Nama",
              "nama",
              "Produk",
              "produk",
              "name"
            ],
            "Tanpa Nama"
          ),

          harga: Number(
            pick(
              row,
              [
                "Harga Jual",
                "hargaJual",
                "harga",
                "Harga",
                "price",
                "Price"
              ],
              0
            )
          ) || 0,

          status: pick(
            row,
            [
              "Status",
              "status",
              "Aktif",
              "aktif"
            ],
            ""
          ),

        };

      });


    console.log(
      "Produk:",
      SafeState.products
    );


    return SafeState.products;


  } catch (error) {

    console.error(
      "getProducts gagal:",
      error
    );

    SafeState.lastErrors.push({
      source: "getProducts",
      error: error.message
    });

    SafeState.products = [];

    return [];

  }
}


/* =========================================================
   7. GET BAHAN
========================================================= */

async function getMaterials() {

  try {

    const rows =
      await fetchAction("bahan");


    SafeState.materials =
      rows.map((row) => {

        const stok =
          Number(
            pick(
              row,
              [
                "Stok Saat Ini",
                "stokSaatIni",
                "stok",
                "Stok",
                "Jumlah",
                "jumlah",
                "Qty",
                "qty",
                "Stock",
                "stock"
              ],
              0
            )
          ) || 0;


        const minimum =
          Number(
            pick(
              row,
              [
                "Minimum Stok",
                "minimumStok",
                "Min Stok",
                "minStok",
                "minimum",
                "Minimum",
                "min",
                "batasMinimum"
              ],
              0
            )
          ) || 0;


        return {

          kode: pick(
            row,
            [
              "ID",
              "id",
              "Kode",
              "kode",
              "code"
            ],
            ""
          ),

          nama: pick(
            row,
            [
              "Nama Bahan",
              "namaBahan",
              "Nama",
              "nama",
              "Bahan",
              "bahan",
              "name"
            ],
            "Tanpa Nama"
          ),

          satuan: pick(
            row,
            [
              "Satuan",
              "satuan",
              "Unit",
              "unit"
            ],
            ""
          ),

          stok,

          minimum,

        };

      });


    console.log(
      "Bahan:",
      SafeState.materials
    );


    return SafeState.materials;


  } catch (error) {

    console.error(
      "getMaterials gagal:",
      error
    );

    SafeState.lastErrors.push({
      source: "getMaterials",
      error: error.message
    });

    SafeState.materials = [];

    return [];

  }
}


/* =========================================================
   8. GET PENJUALAN
========================================================= */

async function getSales() {

  try {

    const rows =
      await fetchAction("penjualan");


    SafeState.sales = rows;

    console.log(
      "Penjualan:",
      SafeState.sales
    );


    return SafeState.sales;


  } catch (error) {

    console.error(
      "getSales gagal:",
      error
    );

    /* Endpoint penjualan bersifat opsional pada tahap ini.
       Jangan menandai ini sebagai error global, agar dashboard
       tetap menampilkan produk & bahan secara normal meskipun
       data penjualan belum tersedia / endpoint belum dibuat. */
    SafeState.sales = [];

    return [];

  }
}


/* =========================================================
   9. GET PEMBELIAN
========================================================= */

async function getPurchases() {

  try {

    const rows =
      await fetchAction("pembelian");


    SafeState.purchases = rows;

    return SafeState.purchases;


  } catch (error) {

    console.error(
      "getPurchases gagal:",
      error
    );

    /* Endpoint pembelian bersifat opsional pada tahap ini.
       Jangan menandai ini sebagai error global. */
    SafeState.purchases = [];

    return [];

  }
}


/* =========================================================
   10. GET TRANSAKSI
========================================================= */

async function getTransactions() {

  try {

    const rows =
      await fetchAction("transaksi");


    SafeState.transactions = rows;

    return SafeState.transactions;


  } catch (error) {

    console.error(
      "getTransactions gagal:",
      error
    );

    SafeState.lastErrors.push({
      source: "getTransactions",
      error: error.message
    });

    SafeState.transactions = [];

    return [];

  }
}


/* =========================================================
   11. STATUS PRODUK
========================================================= */

function isProdukAktif(product) {

  const status =
    String(
      product.status || ""
    ).toLowerCase()
      .trim();


  if (!status) {
    return true;
  }


  const inactiveValues = [

    "nonaktif",
    "non-aktif",
    "tidak aktif",
    "inactive",
    "off",
    "0",
    "false"

  ];


  return !inactiveValues.includes(
    status
  );
}


/* =========================================================
   12. BADGE PRODUK
========================================================= */

function produkStatusBadge(product) {

  const aktif =
    isProdukAktif(product);


  if (aktif) {

    return `
      <span class="badge badge-ok">
        Aktif
      </span>
    `;

  }


  return `
    <span class="badge badge-off">
      Nonaktif
    </span>
  `;
}


/* =========================================================
   13. RENDER PRODUK
========================================================= */

function renderProdukTable(
  products,
  tbodyId,
  countId
) {

  const tbody = $(tbodyId);
  const countEl = $(countId);


  if (!tbody) {
    return;
  }


  if (!products.length) {

    tbody.innerHTML = `
      <tr>
        <td
          colspan="4"
          class="empty-cell"
        >
          Belum ada data produk.
        </td>
      </tr>
    `;


    if (countEl) {
      countEl.textContent =
        "0 produk";
    }


    return;
  }


  tbody.innerHTML =
    products
      .map((product) => {

        return `
          <tr>

            <td class="kode">
              ${escapeHtml(product.kode)}
            </td>

            <td>
              ${escapeHtml(product.nama)}
            </td>

            <td class="td-right">
              ${formatRupiah(product.harga)}
            </td>

            <td class="td-center">
              ${produkStatusBadge(product)}
            </td>

          </tr>
        `;

      })
      .join("");


  if (countEl) {

    countEl.textContent =
      `${products.length} produk`;

  }
}


/* =========================================================
   14. STOK MENIPIS
========================================================= */

function isStokMenipis(material) {

  /* Bahan tanpa batas minimum (minimum = 0 / kosong)
     tidak dianggap menipis, agar tidak semua bahan
     berwarna peringatan. */
  const min = Number(material.minimum);

  if (!min || min <= 0) {
    return false;
  }

  return (
    Number(material.stok) <= min
  );

}


/* =========================================================
   15. BADGE BAHAN
========================================================= */

function bahanStatusBadge(material) {

  if (isStokMenipis(material)) {

    return `
      <span class="badge badge-warn">
        Menipis
      </span>
    `;

  }


  return `
    <span class="badge badge-ok">
      Aman
    </span>
  `;
}


/* =========================================================
   16. RENDER BAHAN
========================================================= */

function renderBahanTable(
  materials,
  tbodyId,
  countId
) {

  const tbody = $(tbodyId);
  const countEl = $(countId);


  if (!tbody) {
    return;
  }


  if (!materials.length) {

    tbody.innerHTML = `
      <tr>
        <td
          colspan="5"
          class="empty-cell"
        >
          Belum ada data bahan.
        </td>
      </tr>
    `;


    if (countEl) {
      countEl.textContent =
        "0 bahan";
    }


    return;
  }


  tbody.innerHTML =
    materials
      .map((material) => {

        const satuan =
          material.satuan
            ? ` ${escapeHtml(material.satuan)}`
            : "";


        return `
          <tr>

            <td class="kode">
              ${escapeHtml(material.kode)}
            </td>

            <td>
              ${escapeHtml(material.nama)}
            </td>

            <td class="td-right">
              ${formatNumber(material.stok)}
              ${satuan}
            </td>

            <td class="td-right">
              ${formatNumber(material.minimum)}
              ${satuan}
            </td>

            <td class="td-center">
              ${bahanStatusBadge(material)}
            </td>

          </tr>
        `;

      })
      .join("");


  if (countEl) {

    countEl.textContent =
      `${materials.length} bahan`;

  }

}


/* =========================================================
   17. RENDER STOK MENIPIS
========================================================= */

function renderLowStockList(materials) {

  const list =
    $("lowStockList");

  const count =
    $("lowCount");


  if (!list) {
    return;
  }


  const lowItems =
    materials.filter(
      isStokMenipis
    );


  if (count) {

    count.textContent =
      `${lowItems.length} item`;

  }


  if (!materials.length) {

    list.innerHTML = `
      <li class="stock-empty">
        Belum ada data bahan.
      </li>
    `;

    return;
  }


  if (!lowItems.length) {

    list.innerHTML = `
      <li class="stock-empty">
        Semua bahan aman.
        Tidak ada stok menipis.
      </li>
    `;

    return;
  }


  list.innerHTML =
    lowItems
      .map((material) => {

        const satuan =
          material.satuan
            ? ` ${escapeHtml(material.satuan)}`
            : "";


        return `
          <li class="stock-row is-low">

            <div class="stock-info">

              <span class="stock-name">
                ${escapeHtml(material.nama)}
              </span>

              <span class="stock-meta">
                Stok:
                ${formatNumber(material.stok)}
                ${satuan}

                • Min:
                ${formatNumber(material.minimum)}
                ${satuan}
              </span>

            </div>

            <span class="stock-badge">
              Restok
            </span>

          </li>
        `;

      })
      .join("");

}


/* =========================================================
   18. PENJUALAN HARI INI
========================================================= */

function getTodayDateString() {

  const now =
    new Date();


  const year =
    now.getFullYear();


  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");


  const day =
    String(
      now.getDate()
    ).padStart(2, "0");


  return (
    `${year}-${month}-${day}`
  );
}


/*
   Mencoba membaca tanggal dari beberapa
   kemungkinan nama kolom.
*/

function getTransactionDate(row) {

  return pick(
    row,
    [
      "Tanggal",
      "tanggal",
      "Date",
      "date",
      "Waktu",
      "waktu",
      "Timestamp",
      "timestamp"
    ],
    ""
  );
}


/*
   Ambil total penjualan.
*/

function getSalesTotal(row) {

  return Number(
    pick(
      row,
      [
        "Total",
        "total",
        "Total Penjualan",
        "totalPenjualan"
      ],
      0
    )
  ) || 0;
}


/*
   Hitung penjualan hari ini.
*/

function calculateTodaySales(sales) {

  if (!sales.length) {
    return 0;
  }


  const today =
    getTodayDateString();


  let total = 0;


  sales.forEach((row) => {

    const rawDate =
      getTransactionDate(row);


    if (!rawDate) {
      return;
    }


    const dateString =
      String(rawDate)
        .substring(0, 10);


    if (
      dateString === today
    ) {

      total +=
        getSalesTotal(row);

    }

  });


  return total;
}


/* =========================================================
   19. RENDER PENJUALAN
========================================================= */

function renderSales(total) {

  const amountEl =
    $("salesAmount");

  const cardValue =
    $("penjualanHariIni");

  const dateEl =
    $("salesDate");


  const text =
    formatRupiah(total);


  if (amountEl) {
    amountEl.textContent =
      text;
  }


  if (cardValue) {
    cardValue.textContent =
      text;
  }


  if (dateEl) {

    const today =
      new Date();


    dateEl.textContent =
      today.toLocaleDateString(
        "id-ID",
        {
          weekday: "long",
          day: "numeric",
          month: "long"
        }
      );

  }

}


/* =========================================================
   20. LOAD DASHBOARD
========================================================= */

async function loadDashboard() {

  showLoading(
    "Memuat data inventory..."
  );

  /* Reset catatan error dari load sebelumnya */
  SafeState.lastErrors = [];

  try {

    /*
     * Ambil data secara paralel
     */

    const [

      products,
      materials,
      sales

    ] = await Promise.all([

      getProducts(),

      getMaterials(),

      getSales()

    ]);


    console.log(
      "Dashboard data:",
      {
        products,
        materials,
        sales
      }
    );


    /*
     * Hitung KPI
     */

    const totalProduk =
      products.filter(
        isProdukAktif
      ).length;


    const totalBahan =
      materials.length;


    const totalMenipis =
      materials.filter(
        isStokMenipis
      ).length;


    const penjualanHariIni =
      calculateTodaySales(
        sales
      );


    /*
     * Update dashboard
     */

    setText(
      "totalProduk",
      totalProduk
    );


    setText(
      "totalBahan",
      totalBahan
    );


    setText(
      "stokMenipis",
      totalMenipis
    );


    renderSales(
      penjualanHariIni
    );


    /*
     * Render list
     */

    renderLowStockList(
      materials
    );


    /*
     * Render produk
     */

    renderProdukTable(
      products,
      "produkTbody",
      "produkCount"
    );


    renderProdukTable(
      products,
      "produkTbody2",
      "produkCount2"
    );


    /*
     * Render bahan
     */

    renderBahanTable(
      materials,
      "bahanTbody",
      "bahanCount"
    );


    /*
     * Inisialisasi form transaksi (dropdown produk/bahan)
     * & muat riwayat penjualan/pembelian.
     */

    initTransactionForms();

    getSales()
      .then(renderPenjualanTable)
      .catch(() => renderPenjualanTable([]));

    getPurchases()
      .then(renderPembelianTable)
      .catch(() => renderPembelianTable([]));


    /*
     * Status
     */

    if (SafeState.lastErrors.length > 0) {
      /* Ada error saat mengakses API (mis. endpoint
         mengembalikan halaman login). Tampilkan pesan
         yang menjelaskan kemungkinan penyebabnya. */
      showError(
        "Gagal mengambil data dari server. Pastikan Google Apps Script " +
          "sudah di-deploy dengan akses 'Anyone' (anonim), lalu coba lagi.",
        true
      );
    } else if (
      products.length === 0 &&
      materials.length === 0
    ) {

      showError(
        "API berhasil dipanggil, tetapi data produk dan bahan masih kosong.",
        true
      );

    } else {

      hideStatus();

    }


  } catch (error) {

    console.error(
      "loadDashboard gagal:",
      error
    );

    showError(
      error.message ||
      "Gagal memuat dashboard.",
      true
    );

  }

}


/* =========================================================
   21. VIEW / NAVIGATION
========================================================= */

const VIEW_META = {

  dashboard: {
    title: "Dashboard",
    subtitle:
      "Selamat datang di WID Inventory"
  },

  produk: {
    title: "Produk",
    subtitle:
      "Daftar produk yang Anda jual"
  },

  bahan: {
    title: "Bahan",
    subtitle:
      "Daftar bahan dan stok"
  },

  pembelian: {
    title: "Pembelian",
    subtitle:
      "Pencatatan pembelian bahan"
  },

  penjualan: {
    title: "Penjualan",
    subtitle:
      "Pencatatan transaksi penjualan"
  },

  laporan: {
    title: "Laporan",
    subtitle:
      "Rekap dan ringkasan"
  }

};


/* =========================================================
   22. SWITCH VIEW
========================================================= */

function switchView(view) {

  if (!VIEW_META[view]) {
    view = "dashboard";
  }


  /*
   * Panel
   */

  document
    .querySelectorAll(".view")
    .forEach((panel) => {

      panel.classList.remove(
        "active"
      );

    });


  const panel =
    $(`view-${view}`);


  if (panel) {

    panel.classList.add(
      "active"
    );

  }


  /*
   * Header
   */

  const meta =
    VIEW_META[view];


  setText(
    "pageTitle",
    meta.title
  );


  setText(
    "pageSubtitle",
    meta.subtitle
  );


  /*
   * Navigation aktif
   */

  document
    .querySelectorAll(
      ".nav-item, .bn-item"
    )
    .forEach((item) => {

      item.classList.remove(
        "active"
      );

    });


  document
    .querySelectorAll(
      `[data-view="${view}"]`
    )
    .forEach((item) => {

      item.classList.add(
        "active"
      );

    });


  /*
   * Tutup mobile menu
   */

  closeMobileMenu();


  /*
   * Muat data sesuai view (untuk form & riwayat transaksi)
   */

  if (view === "penjualan") {
    initTransactionForms();
    getSales().then(renderPenjualanTable).catch(() => {});
  } else if (view === "pembelian") {
    initTransactionForms();
    getPurchases().then(renderPembelianTable).catch(() => {});
  }


  /*
   * Hash URL
   */

  if (
    location.hash !==
    `#${view}`
  ) {

    history.replaceState(
      null,
      "",
      `#${view}`
    );

  }


  /*
   * Scroll ke atas
   */

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   23. MOBILE MENU
========================================================= */

function openMobileMenu() {

  $("sidebar")
    ?.classList.add("open");


  $("overlay")
    ?.classList.add("active");


  $("menuToggle")
    ?.classList.add("active");


  $("menuToggle")
    ?.setAttribute(
      "aria-expanded",
      "true"
    );

}


function closeMobileMenu() {

  $("sidebar")
    ?.classList.remove("open");


  $("overlay")
    ?.classList.remove("active");


  $("menuToggle")
    ?.classList.remove("active");


  $("menuToggle")
    ?.setAttribute(
      "aria-expanded",
      "false"
    );

}


function toggleMobileMenu() {

  const sidebar =
    $("sidebar");


  if (
    sidebar &&
    sidebar.classList.contains(
      "open"
    )
  ) {

    closeMobileMenu();

  } else {

    openMobileMenu();

  }

}


/* =========================================================
   24. EVENT HANDLER
========================================================= */

function bindEvents() {

  /*
   * Sidebar
   */

  document
    .querySelectorAll(".nav-item")
    .forEach((item) => {

      item.addEventListener(
        "click",
        (event) => {

          event.preventDefault();

          switchView(
            item.dataset.view
          );

        }
      );

    });


  /*
   * Bottom navigation
   */

  document
    .querySelectorAll(".bn-item")
    .forEach((item) => {

      item.addEventListener(
        "click",
        (event) => {

          event.preventDefault();

          switchView(
            item.dataset.view
          );

        }
      );

    });


  /*
   * Mobile menu
   */

  $("menuToggle")
    ?.addEventListener(
      "click",
      toggleMobileMenu
    );


  $("overlay")
    ?.addEventListener(
      "click",
      closeMobileMenu
    );


  /*
   * Resize
   */

  window.addEventListener(
    "resize",
    () => {

      if (
        window.innerWidth > 768
      ) {

        closeMobileMenu();

      }

    }
  );


  /*
   * Hash navigation
   */

  window.addEventListener(
    "hashchange",
    () => {

      const view =
        (
          location.hash ||
          "#dashboard"
        ).replace(
          "#",
          ""
        );


      switchView(view);

    }
  );

}


/* =========================================================
   24b. TRANSAKSI — FORM INPUT & ROLLING STOK
=========================================================

   - Mengisi dropdown produk/bahan dari state.
   - Menghitung total otomatis.
   - Mengirim POST ke API (postAction).
   - Backend Apps Script bertanggung jawab membuat header
     kolom otomatis & mengupdate stok bahan (rolling stok).
   - Setelah sukses, reload dashboard agar KPI/stok terbaru.
========================================================= */

/* Tampilkan pesan kecil di dalam form */
function showTxMessage(formId, type, message) {

  let msg = document.getElementById(formId + "Msg");

  if (!msg) {
    msg = document.createElement("div");
    msg.id = formId + "Msg";
    msg.className = "tx-form-msg";
    const form = document.getElementById(formId);
    if (form) form.appendChild(msg);
  }

  msg.className = "tx-form-msg show " + type;
  msg.textContent = message;

  if (type === "ok") {
    setTimeout(() => {
      msg.className = "tx-form-msg";
      msg.textContent = "";
    }, 4000);
  }
}


/* Isi dropdown produk (untuk form penjualan) */
function populateProdukSelect() {

  const select = $("penjualanProduk");

  if (!select) return;

  /* Simpan nilai terpilih */
  const prev = select.value;

  select.innerHTML =
    '<option value="">— Pilih produk —</option>';

  SafeState.products
    .filter(isProdukAktif)
    .forEach((p) => {

      const opt =
        document.createElement("option");

      opt.value = p.kode;
      opt.textContent =
        (p.nama || "Tanpa Nama") +
        (p.kode ? " (" + p.kode + ")" : "");

      /* Simpan harga di data atribut */
      opt.dataset.harga = p.harga || 0;

      select.appendChild(opt);

    });

  if (prev) select.value = prev;
}


/* Isi dropdown bahan (untuk form pembelian) */
function populateBahanSelect() {

  const select = $("pembelianBahan");

  if (!select) return;

  const prev = select.value;

  select.innerHTML =
    '<option value="">— Pilih bahan —</option>';

  SafeState.materials.forEach((m) => {

    const opt =
      document.createElement("option");

    opt.value = m.kode;
    opt.textContent =
      (m.nama || "Tanpa Nama") +
      (m.kode ? " (" + m.kode + ")" : "");

    opt.dataset.satuan = m.satuan || "";
    opt.dataset.stok = m.stok || 0;

    select.appendChild(opt);

  });

  if (prev) select.value = prev;
}


/* Cari objek produk by kode */
function findProductByKode(kode) {
  return SafeState.products.find(
    (p) => String(p.kode) === String(kode)
  );
}


/* Cari objek bahan by kode */
function findMaterialByKode(kode) {
  return SafeState.materials.find(
    (m) => String(m.kode) === String(kode)
  );
}


/* Hitung & tampilkan total penjualan (form) */
function recalcPenjualanTotal() {

  const jml = Number($("penjualanJumlah")?.value) || 0;
  const hrg = Number($("penjualanHarga")?.value) || 0;
  const totalEl = $("penjualanTotal");

  if (totalEl) {
    totalEl.value = formatRupiah(jml * hrg).replace("Rp ", "Rp ");
  }
}


/* Hitung & tampilkan total pembelian (form) */
function recalcPembelianTotal() {

  const jml = Number($("pembelianJumlah")?.value) || 0;
  const hrg = Number($("pembelianHarga")?.value) || 0;
  const totalEl = $("pembelianTotal");

  if (totalEl) {
    totalEl.value = formatRupiah(jml * hrg);
  }
}


/* Saat produk dipilih di form penjualan,
   isi harga otomatis dari data produk. */
function onPenjualanProdukChange() {

  const kode = $("penjualanProduk")?.value || "";
  const hargaInput = $("penjualanHarga");
  const info = $("penjualanHargaInfo");

  const produk = findProductByKode(kode);

  if (produk && hargaInput) {
    hargaInput.value = produk.harga || 0;
  }

  if (info) {
    info.textContent = produk
      ? "Harga jual: " + formatRupiah(produk.harga)
      : "Harga: —";
  }

  recalcPenjualanTotal();
}


/* Saat bahan dipilih di form pembelian,
   isi satuan & tampilkan stok saat ini. */
function onPembelianBahanChange() {

  const kode = $("pembelianBahan")?.value || "";
  const satuanInput = $("pembelianSatuan");
  const info = $("pembelianStokInfo");

  const bahan = findMaterialByKode(kode);

  if (bahan && satuanInput) {
    satuanInput.value = bahan.satuan || "";
  }

  if (info) {
    info.textContent = bahan
      ? "Stok saat ini: " + formatNumber(bahan.stok) +
        (bahan.satuan ? " " + bahan.satuan : "")
      : "Stok saat ini: —";
  }

  recalcPembelianTotal();
}


/* Normalisasi baris penjualan untuk tampilan riwayat.
   Backend menulis header: id, tanggal, produkId, qty,
   hargaSatuan, total, keterangan. produkId adalah kode;
   kita terjemahkan ke nama produk bila tersedia di state. */
function normalizeSaleRow(row) {
  const kode = pick(row, ["produkId", "Produk", "produk", "Kode", "kode"], "");
  const produk = findProductByKode(kode);
  return {
    tanggal: pick(row, ["tanggal", "Tanggal", "Date", "date", "Waktu", "waktu", "Timestamp", "timestamp"], ""),
    nama: produk ? produk.nama : (kode || pick(row, ["Nama Produk", "namaProduk", "Nama", "nama"], "")),
    jumlah: Number(pick(row, ["qty", "Jumlah", "jumlah", "Qty", "qty", "Quantity"], 0)) || 0,
    total: Number(pick(row, ["total", "Total", "Total Penjualan", "totalPenjualan"], 0)) || 0
  };
}


/* Normalisasi baris pembelian untuk tampilan riwayat.
   Backend menulis header: id, tanggal, bahanId, qty,
   satuan, harga, supplier, keterangan. bahanId adalah kode;
   kita terjemahkan ke nama bahan bila tersedia di state.
   Total tidak disimpan backend -> hitung qty x harga. */
function normalizePurchaseRow(row) {
  const kode = pick(row, ["bahanId", "Bahan", "bahan", "Kode", "kode"], "");
  const bahan = findMaterialByKode(kode);
  const qty = Number(pick(row, ["qty", "Jumlah", "jumlah", "Qty", "qty", "Quantity"], 0)) || 0;
  const harga = Number(pick(row, ["harga", "Harga", "hargaSatuan", "Harga Satuan"], 0)) || 0;
  const totalField = Number(pick(row, ["total", "Total", "Total Pembelian", "totalPembelian"], 0)) || 0;
  return {
    tanggal: pick(row, ["tanggal", "Tanggal", "Date", "date", "Waktu", "waktu", "Timestamp", "timestamp"], ""),
    nama: bahan ? bahan.nama : (kode || pick(row, ["Nama Bahan", "namaBahan", "Nama", "nama"], "")),
    jumlah: qty,
    satuan: bahan ? bahan.satuan : pick(row, ["satuan", "Satuan", "Unit", "unit"], ""),
    /* Backend tidak menyimpan kolom total -> hitung dari qty x harga. */
    total: totalField > 0 ? totalField : (qty * harga)
  };
}


/* Render tabel riwayat penjualan */
function renderPenjualanTable(rows) {

  const tbody = $("penjualanTbody");
  const countEl = $("penjualanCount");

  if (!tbody) return;

  const items = (rows || []).map(normalizeSaleRow);

  if (!items.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="empty-cell">Belum ada transaksi penjualan.</td></tr>';
    if (countEl) countEl.textContent = "0 transaksi";
    return;
  }

  /* Tampilkan 10 terbaru (asumsi urutan terbaru di akhir) */
  const recent = items.slice(-10).reverse();

  tbody.innerHTML = recent
    .map((r) => `
      <tr>
        <td>${escapeHtml(String(r.tanggal).substring(0, 10))}</td>
        <td>${escapeHtml(r.nama)}</td>
        <td class="td-right">${formatNumber(r.jumlah)}</td>
        <td class="td-right">${formatRupiah(r.total)}</td>
      </tr>
    `)
    .join("");

  if (countEl) {
    countEl.textContent = items.length + " transaksi";
  }
}


/* Render tabel riwayat pembelian */
function renderPembelianTable(rows) {

  const tbody = $("pembelianTbody");
  const countEl = $("pembelianCount");

  if (!tbody) return;

  const items = (rows || []).map(normalizePurchaseRow);

  if (!items.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="empty-cell">Belum ada transaksi pembelian.</td></tr>';
    if (countEl) countEl.textContent = "0 transaksi";
    return;
  }

  const recent = items.slice(-10).reverse();

  tbody.innerHTML = recent
    .map((r) => `
      <tr>
        <td>${escapeHtml(String(r.tanggal).substring(0, 10))}</td>
        <td>${escapeHtml(r.nama)}</td>
        <td class="td-right">${formatNumber(r.jumlah)}${r.satuan ? " " + escapeHtml(r.satuan) : ""}</td>
        <td class="td-right">${formatRupiah(r.total)}</td>
      </tr>
    `)
    .join("");

  if (countEl) {
    countEl.textContent = items.length + " transaksi";
  }
}


/* Submit penjualan */
async function submitPenjualan(event) {

  event.preventDefault();

  const kode = $("penjualanProduk")?.value;
  const produk = findProductByKode(kode);

  if (!produk) {
    showTxMessage("formPenjualan", "err", "Pilih produk dulu.");
    return;
  }

  const jumlah = Number($("penjualanJumlah")?.value) || 0;
  const harga = Number($("penjualanHarga")?.value) || 0;

  if (jumlah <= 0) {
    showTxMessage("formPenjualan", "err", "Jumlah harus lebih dari 0.");
    return;
  }

  const total = jumlah * harga;

  const payload = {
    action: "penjualan",
    /* Backend Apps Script membaca field di top-level
       (body.produkId, body.qty), bukan di body.data. */
    produkId: produk.kode,
    qty: jumlah,
    keterangan: ""
  };

  const btn = $("btnPenjualan");
  if (btn) btn.disabled = true;
  showTxMessage("formPenjualan", "ok", "Mengirim data...");

  try {

    await postAction(payload);

    showTxMessage("formPenjualan", "ok", "Penjualan tersimpan! Stok bahan diperbarui.");

    /* Reset form */
    const form = $("formPenjualan");
    if (form) form.reset();
    if ($("penjualanHargaInfo")) $("penjualanHargaInfo").textContent = "Harga: —";
    if ($("penjualanTotal")) $("penjualanTotal").value = "";

    /* Reload dashboard untuk update KPI & stok */
    loadDashboard();

    /* Refresh riwayat penjualan */
    getSales().then(renderPenjualanTable).catch(() => {});

  } catch (error) {

    console.error("submitPenjualan gagal:", error);
    showTxMessage("formPenjualan", "err", error.message || "Gagal menyimpan penjualan.");

  } finally {

    if (btn) btn.disabled = false;

  }
}


/* Submit pembelian */
async function submitPembelian(event) {

  event.preventDefault();

  const kode = $("pembelianBahan")?.value;
  const bahan = findMaterialByKode(kode);

  if (!bahan) {
    showTxMessage("formPembelian", "err", "Pilih bahan dulu.");
    return;
  }

  const jumlah = Number($("pembelianJumlah")?.value) || 0;
  const harga = Number($("pembelianHarga")?.value) || 0;
  const supplier = $("pembelianSupplier")?.value || "";

  if (jumlah <= 0) {
    showTxMessage("formPembelian", "err", "Jumlah harus lebih dari 0.");
    return;
  }

  const total = jumlah * harga;

  const payload = {
    action: "pembelian",
    /* Backend Apps Script membaca field di top-level
       (body.bahanId, body.qty, body.harga, body.supplier). */
    bahanId: bahan.kode,
    qty: jumlah,
    harga: harga,
    supplier: supplier,
    keterangan: ""
  };

  const btn = $("btnPembelian");
  if (btn) btn.disabled = true;
  showTxMessage("formPembelian", "ok", "Mengirim data...");

  try {

    await postAction(payload);

    showTxMessage("formPembelian", "ok", "Pembelian tersimpan! Stok bahan bertambah otomatis.");

    const form = $("formPembelian");
    if (form) form.reset();
    if ($("pembelianStokInfo")) $("pembelianStokInfo").textContent = "Stok saat ini: —";
    if ($("pembelianTotal")) $("pembelianTotal").value = "";

    loadDashboard();

    getMaterials().then(() => {
      populateBahanSelect();
    }).catch(() => {});

    getPurchases().then(renderPembelianTable).catch(() => {});

  } catch (error) {

    console.error("submitPembelian gagal:", error);
    showTxMessage("formPembelian", "err", error.message || "Gagal menyimpan pembelian.");

  } finally {

    if (btn) btn.disabled = false;

  }
}


/* Inisialisasi form transaksi (dipanggil setelah data produk/bahan siap) */
function initTransactionForms() {

  populateProdukSelect();
  populateBahanSelect();

  /* Penjualan: perubahan produk & jumlah/harga */
  const pProduk = $("penjualanProduk");
  if (pProduk && !pProduk.dataset.bound) {
    pProduk.addEventListener("change", onPenjualanProdukChange);
    pProduk.dataset.bound = "1";
  }

  const pJumlah = $("penjualanJumlah");
  if (pJumlah && !pJumlah.dataset.bound) {
    pJumlah.addEventListener("input", recalcPenjualanTotal);
    pJumlah.dataset.bound = "1";
  }

  const pHarga = $("penjualanHarga");
  if (pHarga && !pHarga.dataset.bound) {
    pHarga.addEventListener("input", recalcPenjualanTotal);
    pHarga.dataset.bound = "1";
  }

  const formPenjualan = $("formPenjualan");
  if (formPenjualan && !formPenjualan.dataset.bound) {
    formPenjualan.addEventListener("submit", submitPenjualan);
    formPenjualan.dataset.bound = "1";
  }

  /* Pembelian: perubahan bahan & jumlah/harga */
  const bBahan = $("pembelianBahan");
  if (bBahan && !bBahan.dataset.bound) {
    bBahan.addEventListener("change", onPembelianBahanChange);
    bBahan.dataset.bound = "1";
  }

  const bJumlah = $("pembelianJumlah");
  if (bJumlah && !bJumlah.dataset.bound) {
    bJumlah.addEventListener("input", recalcPembelianTotal);
    bJumlah.dataset.bound = "1";
  }

  const bHarga = $("pembelianHarga");
  if (bHarga && !bHarga.dataset.bound) {
    bHarga.addEventListener("input", recalcPembelianTotal);
    bHarga.dataset.bound = "1";
  }

  const formPembelian = $("formPembelian");
  if (formPembelian && !formPembelian.dataset.bound) {
    formPembelian.addEventListener("submit", submitPembelian);
    formPembelian.dataset.bound = "1";
  }
}


/* =========================================================
   25. INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    console.log(
      "WID Inventory starting..."
    );


    console.log(
      "API URL:",
      API_URL
    );


    /*
     * Bind event
     */

    bindEvents();


    /*
     * Tentukan halaman awal
     */

    const initialView =
      (
        location.hash ||
        "#dashboard"
      ).replace(
        "#",
        ""
      );


    switchView(
      initialView
    );


    /*
     * Load dashboard
     */

    loadDashboard();

  }
);

