# WID Inventory — Repository Knowledge

## Stack
- Frontend: Vanilla JS (`index.html`, `style.css`, `script.js`), hosted on GitHub Pages.
- Backend: Google Apps Script Web App (`apps-script/Code.gs`), backed by Google Spreadsheet.
- Deployment URL (Pages): https://iwpw03.github.io/Digidizy.ID-01/

## Apps Script Web App quirks (IMPORTANT)
- GET and POST both return HTTP 302 redirect from `script.google.com` to
  `script.googleusercontent.com`, which serves the actual JSON.
- `fetch` with `redirect: "follow"` (default) follows this and gets JSON. OK.
- `curl -L` on POST re-issues as GET on the redirect URL → returns HTML "Page Not Found".
  To test POST via curl: capture `redirect_url` with `-w "%{redirect_url}"` then GET it.
- POST must use `Content-Type: text/plain;charset=utf-8` to avoid CORS preflight.
- Web App must be deployed with "Who has access: Anyone" or it returns a login HTML wall.

## Spreadsheet sheet field names (actual headers)
- PRODUK: `ID`, `Nama Produk`, `Harga Jual`, `Status`
- BAHAN: `ID`, `Nama Bahan`, `Satuan`, `Stok Awal`, `Stok Saat Ini`, `Minimum Stok`
- RESEP: `ID`, `Produk ID`, `Bahan ID`, `Qty Pemakaian`
- PEMBELIAN (auto-created): `id, tanggal, bahanId, qty, satuan, harga, supplier, keterangan` (NO total column)
- PENJUALAN (auto-created): `id, tanggal, produkId, qty, total` (total computed server-side)

## Key conventions
- Frontend `pick(row, [possibleKeys], default)` resolves fields despite header variants.
- `normalizePurchaseRow` computes `total = qty * harga` since backend doesn't store total for pembelian.
- `findMaterialByKode` / `findProductByKode` translate backend kode (P001/B001) → nama for display.
- `?v=N` cache-buster on script.js/style.css in index.html — bump when pushing JS/CSS changes so
  users see updates immediately (GitHub Pages CDN caches aggressively otherwise).

## Verified working (2026-08-12)
- GET produk/bahan/pembelian/penjualan/resep: JSON returned, all rendered.
- POST penjualan: saves transaction + rolling stock reduction via RESEP (qty × qtyPemakaian).
- POST pembelian: saves transaction + rolling stock increase.
- Dashboard "Penjualan Hari Ini" total computed from today's sales.
- Riwayat tables render with kode→nama resolution and correct totals.

## Backend deployment (user action)
Code.gs v2 lives in `apps-script/`. User must paste into their Apps Script project and
redeploy with "Anyone" access. README in `apps-script/` has full steps.
