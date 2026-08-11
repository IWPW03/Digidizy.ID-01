
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
  "https://script.google.com/macros/s/AKfycbzc04bZ7ilAOlxCASJBczwNAw3DBVjutv3qB4I4EbDyIZ45eE8Qg2HHIaIDOtO7PEwp3A/exec";


/* =========================================================
   2. STATE APLIKASI
========================================================= */

const SafeState = {
  products: [],
  materials: [],
  purchases: [],
  sales: [],
  transactions: [],
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

function showLoading(message = "Memuat data...") {

  const banner = $("statusBanner");

  if (!banner) {
    return;
  }

  banner.hidden = false;
  banner.className = "status-banner loading";
  banner.textContent = message;
}


function showError(message) {

  const banner = $("statusBanner");

  if (!banner) {
    return;
  }

  banner.hidden = false;
  banner.className = "status-banner error";

  banner.textContent =
    message ||
    "Gagal mengambil data dari server.";
}


function hideStatus() {

  const banner = $("statusBanner");

  if (!banner) {
    return;
  }

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

function fetchAction(action) {

  return new Promise((resolve, reject) => {

    if (!API_URL) {

      reject(
        new Error("API_URL belum dikonfigurasi.")
      );

      return;
    }


    /* Nama callback unik */

    const callbackName =
      "widCallback_" +
      Date.now() +
      "_" +
      Math.floor(Math.random() * 100000);


    /* Buat element script */

    const script =
      document.createElement("script");


    /* Buat URL */

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


    /* Cleanup */

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


    /* Callback dari Apps Script */

    window[callbackName] = function(response) {

      cleanup();

      console.log(
        "[WID API]",
        action,
        response
      );


      if (!response) {

        reject(
          new Error(
            "Response API kosong."
          )
        );

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


      /*
       * Format:
       * { success:true, data:[...] }
       */

      if (
        response &&
        Array.isArray(response.data)
      ) {

        resolve(response.data);

        return;
      }


      /*
       * Format:
       * { rows:[...] }
       */

      if (
        response &&
        Array.isArray(response.rows)
      ) {

        resolve(response.rows);

        return;
      }


      /*
       * Format:
       * { produk:[...] }
       * { bahan:[...] }
       */

      if (
        response &&
        Array.isArray(response[action])
      ) {

        resolve(response[action]);

        return;
      }


      /*
       * Format langsung array
       */

      if (Array.isArray(response)) {

        resolve(response);

        return;
      }


      /*
       * Jika tidak ditemukan data,
       * tetap return array kosong.
       */

      resolve([]);
    };


    /* Error script */

    script.onerror = function() {

      cleanup();

      reject(
        new Error(
          "Gagal menghubungi API: " +
          action
        )
      );
    };


    /* Pasang URL */

    script.src = url;


    /*
     * Tambahkan ke halaman
     */

    document.body.appendChild(script);


    /*
     * Timeout 15 detik
     */

    setTimeout(() => {

      if (!selesai) {

        cleanup();

        reject(
          new Error(
            "API timeout: " +
            action
          )
        );

      }

    }, 15000);

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

  return (
    Number(material.stok) <=
    Number(material.minimum)
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
     * Status
     */

    if (
      products.length === 0 &&
      materials.length === 0
    ) {

      showError(
        "API berhasil dipanggil, tetapi data produk dan bahan masih kosong."
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
      "Gagal memuat dashboard."
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
```
