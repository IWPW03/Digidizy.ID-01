/**
 * ============================================================
 * WID INVENTORY API
 * Google Apps Script + Google Sheets
 * ------------------------------------------------------------
 * Versi: 2  (frontend form input Penjualan & Pembelian)
 *
 * Perubahan dari versi sebelumnya:
 *  - appendRow() membuat header kolom otomatis bila sheet
 *    masih kosong / belum punya header, sehingga input
 *    pertama langsung membentuk struktur kolom.
 *  - prosesPenjualan() menjadi LENIENT: bila produk belum
 *    punya resep, penjualan tetap dicatat (tanpa pengurangan
 *    stok bahan) — agar modul penjualan bisa dipakai sebelum
 *    resep diisi. Bila resep ada, stok bahan dikurangi
 *    otomatis (rolling stok) seperti sebelumnya.
 *  - doGet kembali 'callback' (JSONP) bila dikirim, untuk
 *    kompatibilitas frontend lama.
 *  - Header kolom dinormalisasi agar frontend bisa membaca
 *    riwayat transaksi dengan benar.
 * ============================================================
 */


const SHEET_PRODUK = "PRODUK";
const SHEET_BAHAN = "BAHAN";
const SHEET_RESEP = "RESEP";
const SHEET_TRANSAKSI = "TRANSAKSI";
const SHEET_PEMBELIAN = "PEMBELIAN";
const SHEET_PENJUALAN = "PENJUALAN";


/* Header kolom tiap sheet. Dipakai appendRow untuk
   membuat baris header otomatis bila sheet masih kosong. */
const SHEET_HEADERS = {
  PRODUK: ["id", "nama", "harga", "status"],
  BAHAN: ["id", "nama", "satuan", "minimum", "stok"],
  RESEP: ["id", "produkId", "bahanId", "qtyPemakaian"],
  TRANSAKSI: ["id", "tanggal", "jenis", "refId", "refItemId", "qty", "keterangan"],
  PEMBELIAN: ["id", "tanggal", "bahanId", "qty", "satuan", "harga", "supplier", "keterangan"],
  PENJUALAN: ["id", "tanggal", "produkId", "qty", "hargaSatuan", "total", "keterangan"]
};


/**
 * ============================================================
 * GET API
 * ============================================================
 */

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action || "";
    const callback = params.callback || "";

    let result;

    switch (action) {
      case "produk":
        result = getProduk();
        break;
      case "bahan":
        result = getBahan();
        break;
      case "resep":
        result = getResep();
        break;
      case "transaksi":
        result = getTransaksi();
        break;
      case "pembelian":
        result = getPembelian();
        break;
      case "penjualan":
        result = getPenjualan();
        break;
      default:
        result = {
          success: true,
          message: "WID Inventory API aktif",
          timestamp: new Date().toISOString()
        };
        break;
    }

    return outputResponse(result, callback);
  } catch (error) {
    return outputResponse({ success: false, message: error.toString() }, "");
  }
}


/**
 * ============================================================
 * RESPONSE JSON / JSONP
 * ============================================================
 */

function outputResponse(data, callback) {
  const json = JSON.stringify(data);

  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * ============================================================
 * BACA SHEET
 * ============================================================
 */

function bacaSheet(namaSheet) {
  const sheet = getSheet(namaSheet);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (!values || values.length <= 1) return [];

  const headers = values[0];
  const result = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const kosong = row.every(function (v) {
      return v === "" || v === null;
    });
    if (kosong) continue;

    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const header = String(headers[j]).trim();
      if (header !== "") obj[header] = row[j];
    }
    result.push(obj);
  }

  return result;
}


/**
 * ============================================================
 * GET DATA
 * ============================================================
 */

function getProduk() {
  return { success: true, data: bacaSheet(SHEET_PRODUK) };
}

function getBahan() {
  return { success: true, data: bacaSheet(SHEET_BAHAN) };
}

function getResep() {
  return { success: true, data: bacaSheet(SHEET_RESEP) };
}

function getTransaksi() {
  return { success: true, data: bacaSheet(SHEET_TRANSAKSI) };
}

function getPembelian() {
  return { success: true, data: bacaSheet(SHEET_PEMBELIAN) };
}

function getPenjualan() {
  return { success: true, data: bacaSheet(SHEET_PENJUALAN) };
}


/**
 * ============================================================
 * HELPER SHEET
 * ============================================================
 */

function getSheet(namaSheet) {
  return SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(namaSheet);
}

/* Pastikan sheet ada; buat bila belum. */
function pastikanSheet(namaSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(namaSheet);
  if (!sheet) {
    sheet = ss.insertSheet(namaSheet);
  }
  return sheet;
}

/* Pastikan baris header sudah ada di sheet.
   Bila sheet kosong / header belum sesuai, tulis header. */
function pastikanHeader(namaSheet) {
  const sheet = pastikanSheet(namaSheet);
  const headers = SHEET_HEADERS[namaSheet];

  if (!headers) return sheet;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow === 0 || lastCol === 0) {
    /* Sheet kosong -> tulis header */
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const same = existing.length === headers.length &&
    existing.every(function (h, i) {
      return String(h).trim() === String(headers[i]);
    });

  if (!same) {
    /* Header tidak cocok -> tulis ulang header di baris 1
       (asumsi belum ada data transaksi nyata). */
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}


/**
 * ============================================================
 * CARI BAHAN
 * ============================================================
 */

function cariBahanById(bahanId) {
  const sheet = getSheet(SHEET_BAHAN);
  if (!sheet) return null;

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(bahanId)) {
      return { rowIndex: i + 1, data: values[i] };
    }
  }
  return null;
}


/**
 * ============================================================
 * CARI PRODUK
 * ============================================================
 */

function cariProdukById(produkId) {
  const sheet = getSheet(SHEET_PRODUK);
  if (!sheet) return null;

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(produkId)) {
      return { rowIndex: i + 1, data: values[i] };
    }
  }
  return null;
}


/**
 * ============================================================
 * CARI RESEP
 * ============================================================
 */

function cariResepByProdukId(produkId) {
  const sheet = getSheet(SHEET_RESEP);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  const resep = [];

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]) === String(produkId)) {
      resep.push({
        bahanId: values[i][2],
        qtyPemakaian: Number(values[i][3]) || 0
      });
    }
  }

  return resep;
}


/**
 * ============================================================
 * GENERATE ID
 * ============================================================
 */

function generateId(prefix, namaSheet) {
  const sheet = getSheet(namaSheet);
  let nomor = 1;

  if (sheet) {
    const lastRow = sheet.getLastRow();
    /* lastRow termasuk baris header -> jumlah data = lastRow-1 */
    if (lastRow > 1) nomor = lastRow;
  }

  const nomorStr = String(nomor).padStart(5, "0");
  return prefix + "-" + nomorStr;
}


/**
 * ============================================================
 * TANGGAL
 * ============================================================
 */

function getNowString() {
  const d = new Date();
  return Utilities.formatDate(
    d,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm:ss"
  );
}


/**
 * ============================================================
 * POST API
 * ============================================================
 */

function doPost(e) {
  try {
    let body = {};

    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    const action = body.action || "";
    let result;

    switch (action) {
      case "pembelian":
        result = prosesPembelian(body);
        break;
      case "penjualan":
        result = prosesPenjualan(body);
        break;
      default:
        result = {
          success: false,
          message: "Aksi POST tidak dikenal: " + action
        };
    }

    return outputResponse(result, "");
  } catch (error) {
    return outputResponse({
      success: false,
      message: error.toString()
    }, "");
  }
}


/**
 * ============================================================
 * PEMBELIAN  (rolling stok: stok bahan BERTAMBAH)
 * ============================================================
 */

function prosesPembelian(body) {
  if (!body.bahanId) {
    return { success: false, message: "bahanId wajib diisi" };
  }

  const qty = Number(body.qty);
  if (!qty || qty <= 0) {
    return { success: false, message: "qty harus lebih besar dari 0" };
  }

  const harga = Number(body.harga) || 0;

  const bahan = cariBahanById(body.bahanId);
  if (!bahan) {
    return {
      success: false,
      message: "Bahan ID tidak ditemukan: " + body.bahanId
    };
  }

  /* Rolling stok: stok lama (kolom 5 / index 4) + qty */
  const stokLama = Number(bahan.data[4]) || 0;
  const stokBaru = stokLama + qty;
  const satuan = bahan.data[2] || "";

  const sheetBahan = getSheet(SHEET_BAHAN);
  sheetBahan.getRange(bahan.rowIndex, 5).setValue(stokBaru);

  /* Pastikan sheet pembelian punya header */
  pastikanHeader(SHEET_PEMBELIAN);
  pastikanHeader(SHEET_TRANSAKSI);

  const transactionId = generateId("PUR", SHEET_PEMBELIAN);
  const sekarang = getNowString();

  appendRow(SHEET_PEMBELIAN, [
    transactionId,
    sekarang,
    body.bahanId,
    qty,
    satuan,
    harga,
    body.supplier || "",
    body.keterangan || ""
  ]);

  appendRow(SHEET_TRANSAKSI, [
    transactionId,
    sekarang,
    "PEMBELIAN",
    transactionId,
    body.bahanId,
    qty,
    body.keterangan || ""
  ]);

  return {
    success: true,
    message: "Pembelian berhasil disimpan",
    transactionId: transactionId,
    stock: stokBaru
  };
}


/**
 * ============================================================
 * PENJUALAN  (rolling stok: stok bahan BERKURANG bila ada resep)
 * ------------------------------------------------------------
 * Bila produk belum memiliki resep, penjualan tetap dicatat
 * (tanpa pengurangan stok) — sehingga modul penjualan bisa
 * dipakai sebelum resep diisi. Begitu resep diisi, stok bahan
 * otomatis dikurangi sesuai qtyPemakaian x qty terjual.
 * ============================================================
 */

function prosesPenjualan(body) {
  if (!body.produkId) {
    return { success: false, message: "produkId wajib diisi" };
  }

  const qty = Number(body.qty);
  if (!qty || qty <= 0) {
    return { success: false, message: "qty harus lebih besar dari 0" };
  }

  const produk = cariProdukById(body.produkId);
  if (!produk) {
    return {
      success: false,
      message: "Produk ID tidak ditemukan: " + body.produkId
    };
  }

  const hargaSatuan = Number(produk.data[2]) || 0;
  const total = qty * hargaSatuan;

  const resep = cariResepByProdukId(body.produkId);

  /* Cek kebutuhan & ketersediaan stok (hanya bila ada resep) */
  const kebutuhan = [];

  if (resep.length) {
    for (let i = 0; i < resep.length; i++) {
      const r = resep[i];
      const qtyUsed = qty * r.qtyPemakaian;
      const bahan = cariBahanById(r.bahanId);

      if (!bahan) {
        return {
          success: false,
          message: "Bahan pada resep tidak ditemukan: " + r.bahanId
        };
      }

      const stokSekarang = Number(bahan.data[4]) || 0;

      if (stokSekarang < qtyUsed) {
        return {
          success: false,
          message: "Stok bahan tidak mencukupi: " + r.bahanId
        };
      }

      kebutuhan.push({
        bahanId: r.bahanId,
        qtyUsed: qtyUsed,
        bahanObj: bahan,
        stokSekarang: stokSekarang
      });
    }

    /* Semua stok tersedia -> kurangi stok */
    const sheetBahan = getSheet(SHEET_BAHAN);
    for (let i = 0; i < kebutuhan.length; i++) {
      const k = kebutuhan[i];
      const stokAkhir = k.stokSekarang - k.qtyUsed;
      sheetBahan.getRange(k.bahanObj.rowIndex, 5).setValue(stokAkhir);
    }
  }

  pastikanHeader(SHEET_PENJUALAN);
  pastikanHeader(SHEET_TRANSAKSI);

  const transactionId = generateId("SAL", SHEET_PENJUALAN);
  const sekarang = getNowString();

  appendRow(SHEET_PENJUALAN, [
    transactionId,
    sekarang,
    body.produkId,
    qty,
    hargaSatuan,
    total,
    body.keterangan || ""
  ]);

  appendRow(SHEET_TRANSAKSI, [
    transactionId,
    sekarang,
    "PENJUALAN",
    transactionId,
    body.produkId,
    qty,
    body.keterangan || ""
  ]);

  const items = kebutuhan.map(function (k) {
    return { bahanId: k.bahanId, qtyUsed: k.qtyUsed };
  });

  return {
    success: true,
    message: resep.length
      ? "Penjualan berhasil disimpan, stok bahan diperbarui"
      : "Penjualan berhasil disimpan (resep belum diisi, stok bahan tidak diubah)",
    transactionId: transactionId,
    total: total,
    items: items
  };
}


/**
 * ============================================================
 * APPEND ROW  (membuat header kolom otomatis bila kosong)
 * ============================================================
 */

function appendRow(namaSheet, rowData) {
  /* Pastikan sheet & header ada sebelum menambah baris data */
  pastikanHeader(namaSheet);

  const sheet = getSheet(namaSheet);
  if (!sheet) {
    throw new Error("Sheet tidak ditemukan: " + namaSheet);
  }

  sheet.appendRow(rowData);
}
