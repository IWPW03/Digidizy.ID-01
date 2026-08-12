# WID Inventory — Apps Script (Backend)

File `Code.gs` berisi kode backend Google Apps Script untuk
WID Inventory. Versi ini (v2) mendukung input Penjualan &
Pembelian dari frontend, dengan rolling stok otomatis dan
pembuatan header kolom otomatis.

## Cara pasang

1. Buka project Apps Script Anda (yang sama dengan deployment
   Web App yang dipakai frontend).
2. Hapus isi file `Code.gs` yang lama, lalu paste seluruh isi
   `Code.gs` dari folder ini.
3. **Deploy → Manage deployments → Edit**:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. **Deploy** → salin URL Web App baru → update `API_URL`
   di `script.js` (frontend) bila URL berubah.

## Sheet & kolom

Kode otomatis membuat header kolom saat transaksi pertama
masuk. Anda TIDAK perlu membuat kolom manual. Struktur:

| Sheet       | Kolom                                                       |
| ----------- | ----------------------------------------------------------- |
| PRODUK      | id, nama, harga, status                                     |
| BAHAN       | id, nama, satuan, minimum, stok                             |
| RESEP       | id, produkId, bahanId, qtyPemakaian                         |
| TRANSAKSI   | id, tanggal, jenis, refId, refItemId, qty, keterangan       |
| PEMBELIAN   | id, tanggal, bahanId, qty, satuan, harga, supplier, keterangan |
| PENJUALAN   | id, tanggal, produkId, qty, hargaSatuan, total, keterangan |

> Catatan: sheet PRODUK & BAHAN sebaiknya sudah Anda isi
> manual (id, nama, harga/stok, dll) sebelum input transaksi.
> Header PRODUK/BAHAN boleh apa pun — frontend membaca
> beberapa kemungkinan nama field. Header di atas adalah
> rekomendasi agar konsisten.

## Rolling stok

### Pembelian
Setiap input pembelian → stok bahan **bertambah** otomatis
sesuai qty. Tidak perlu resep.

### Penjualan
- **Bila produk punya resep** (sheet RESEP terisi):
  stok bahan **berkurang** otomatis = qty terjual × qtyPemakaian.
  Bila stok tidak mencukupi, transaksi ditolak.
- **Bila produk belum punya resep** (RESEP kosong untuk
  produk itu): penjualan tetap dicatat, TANPA pengurangan
  stok. Ini agar modul penjualan bisa dipakai sebelum resep
  diisi. Begitu resep diisi, pengurangan stok otomatis aktif.

## Mengisi RESEP (agar stok otomatis berkurang saat jual)

Sheet RESEP: `id, produkId, bahanId, qtyPemakaian`

Contoh: produk P001 (Es Teh Original) butuh 2 gram teh & 1 gram gula per cup.

| id    | produkId | bahanId | qtyPemakaian |
| ----- | -------- | ------- | ------------ |
| R0001 | P001     | B001    | 2            |
| R0002 | P001     | B002    | 1            |

`produkId` & `bahanId` harus cocok dengan kolom `id` di
sheet PRODUK & BAHAN. `qtyPemakaian` = jumlah bahan per
1 unit produk terjual.

Setelah RESEP diisi, setiap penjualan P001 akan otomatis
mengurangi stok B001 (teh) 2×qty dan B002 (gula) 1×qty.
