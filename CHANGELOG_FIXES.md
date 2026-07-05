# Tuzatishlar ro'yxati (CHANGELOG) — AUDIT_READY_FIXED9_HOTFIX2

Bu fayl audit natijasida topilgan kamchiliklarning **shu loyihada** tuzatilganini hujjatlashtiradi.
Har bir tuzatish kodda `// FIX:` izohi bilan belgilangan.

> **Eslatma:** Tahrirlardan keyin eski build artefaktlari (`web/dist`, `functions/lib`) eskirgan.
> Deploydan oldin qayta yig'ish shart: `cd web && npm i && npm run build` va `cd functions && npm i && npm run build`.

---

## 🔴 Kritik

1. **`voidPurchase` — Firestore read-after-write buzilishi** (`web/src/services/purchases.ts`)
   - Tranzaksiya endi ikki fazaga ajratilgan: avval BARCHA o'qishlar (kirim + barcha mahsulot + ta'minotchi), keyin barcha yozuvlar.
   - Rollback endi eski snapshotni mutlaq qayta yozish o'rniga **delta-reversal** qiladi (joriy ombor/avgCost'dan shu kirim hissasini ayiradi) — kirimdan keyingi savdo/kirimlarni o'chirmaydi.

2. **Haftalik/oylik hisobotlar bo'sh chiqishi** (`functions/src/index.ts`)
   - `buildShopReport` va `sendCustomerStatementsPdf` endi `createdAt`ni **raqamli** (`from.getTime()`) chegara bilan qidiradi (avval `Timestamp.fromDate` ishlatib 0 ta hujjat qaytarardi).

3. **Offline savdoni qayta yuborishda dublikat** (`web/src/services/sales.ts`, `web/src/routes/PosPage.tsx`)
   - `createSale`ga **`operationId`** idempotentlik kaliti qo'shildi: deterministik savdo hujjati id + mavjudligini tekshirish.
   - `PosPage.finalize` har bir savdo uchun barqaror `operationId` yaratadi va offline navbatga ham shuni uzatadi → qayta yuborilganda savdo/ombor/kassa **takrorlanmaydi**.

4. **Kassir umuman savdo qila olmasligi** (NEW versiya regressiyasi) (`firebase/firestore.rules`)
   - `stock_movements` yaratish endi `isCashier()` talab qiladi (avval `dangerousAllowed()` edi — `pinVerified()` doim false bo'lgani uchun kassir har qanday savdoda bloklanardi).

5. **`createReturn` qaytarish hujjatini umuman yozmasdi + read-after-write** (`web/src/services/sales.ts`)
   - To'liq qayta yozildi: avval barcha o'qishlar, keyin yozuvlar; **return hujjati endi yoziladi** (`createdBy` bilan); VOID savdoga qaytarish bloklanadi; avval qaytarilgan miqdor hisobga olinadi (ortiqcha qaytarishni oldini oladi); idempotentlik.

6. **`voidSale` — read-after-write + ortiqcha ombor qaytarish** (`web/src/services/sales.ts`)
   - Ikki fazaga ajratildi; faqat **qaytarilmagan** miqdor omborga qaytariladi (qaytarilgan + void = ikki barobar oshishni oldini oladi).

---

## 🟠 Yuqori

7. **Telegram webhook secret bypass** (`functions/src/index.ts`)
   - `&& gotSecret` sharti olib tashlandi → secret sozlangan bo'lsa, sarlavhasi yo'q/mos kelmagan so'rov **rad etiladi** (fail-closed).

8. **Yangi mahsulot barcode unikalligi** (`web/src/services/purchases.ts`)
   - `createPurchase` deterministik `p_<barcode>` id'ni tranzaksiyada o'qiydi; mavjud bo'lsa dublikat/ustiga-yozish o'rniga MAVJUD mahsulotga ombor qo'shadi.

9. **Hisobot accounting** (`web/src/services/reports.ts`)
   - Void qilingan savdo/kirimlar hisobotdan chiqarildi (qayta tiklandi).
   - Qaytarishlar endi **accrual** asosida `returns` kolleksiyasidan olinadi: `netRevenue = grossSales − returnsTotal`.
   - Foyda: `approxProfit = profitFromSales − returnProfit − expenses` (qaytarish marjasi ayiriladi).

---

## 🟡 / 🔵 O'rta va past

10. **PIN-gating ishlamasligi** (`functions/src/index.ts`, `firebase/firestore.rules`)
    - `verifyAdminPin` endi `pinVerified: true` claim'ini ham o'rnatadi; rules `pinVerified()` endi 5-daqiqalik muddatni (`pinVerifiedUntil`) ham majburlaydi.

11. **`accountant` roli ruxsatsiz** (`firebase/firestore.rules`)
    - `isViewer()` helper qo'shildi (`isCashier() || accountant`); moliyaviy kolleksiyalarda `allow read` endi accountant'ga ham ruxsat beradi (faqat o'qish).

12. **POS "Qarz" tugmasi to'liq naqd savdo yozardi** (`web/src/routes/PosPage.tsx`)
    - "Qarz" bosilganda, summa kamaytirilmagan bo'lsa, to'langan = 0 (to'liq qarz) qilib yuboriladi.

13. **Mijoz to'lovi `serverTimestamp()` + `createdBy="system"`** (`web/src/services/customers.ts`)
    - `createdAt` raqam (`Date.now()`) ga o'tkazildi (hisobot/kassa filtri ko'rishi uchun); `createdBy` endi `auth.uid` (yo'q bo'lsa aniq xato beradi).

14. **`onCustomerPaymentNotify` vaqt "hozir" bo'lib qolishi** (`functions/src/index.ts`)
    - Raqamli `createdAt` to'g'ri `Date`ga aylantiriladi.

15. **Report A4 shabloni XSS** (`web/src/modules/print/reportA4.ts`)
    - `shopTitle` HTMLga qo'yishdan oldin escape qilinadi. (Chek `receipt.ts` allaqachon escape qiladi.)

16. **`env()` falsy tekshiruvi** (`web/src/lib/env.ts`)
    - `"0"` / bo'sh kabi qiymatlar endi noto'g'ri "yo'q" deb hisoblanmaydi (faqat `undefined/null/""`).

---

## Tahrirlangan fayllar
- `web/src/services/sales.ts`
- `web/src/services/purchases.ts`
- `web/src/services/reports.ts`
- `web/src/services/customers.ts`
- `web/src/routes/PosPage.tsx`
- `web/src/lib/env.ts`
- `web/src/modules/print/reportA4.ts`
- `functions/src/index.ts`
- `firebase/firestore.rules`

## Hali qolgan (kichik, ixtiyoriy) yaxshilanishlar
- `listPurchases`/`listCashTxns`/`listSupplierPayments` butun kolleksiyani yuklab keyin kesadi (Firestore `limit()` qo'shish tavsiya).
- CashHistory faqat oxirgi ~60 savdoni yuklaydi (o'tgan davr filtrlash uchun sana bo'yicha so'rov tavsiya).
- `sw.js`/`version.json`/`version.ts` versiya satrlari nomuvofiq.
- Kompozit indekslarni `firestore.indexes.json` orqali e'lon qilish (owner_requests where+orderBy).
