# Ali Biznes — Tuzatish ishlari bo'yicha UMUMIY HISOBOT

Loyiha: **Ali Biznes boshqaruv** (React + TypeScript + Vite + Firebase) — POS + Ombor + Mijoz/Ta'minotchi + Kassa + Hisobot + Telegram.
Sayt: `alilazer.uz` · Firebase loyiha: `han-biznes-boshqaruv-1a41f`

---

## 0) Qisqacha xulosa

- To'liq **audit** o'tkazildi → **89 ta tasdiqlangan kamchilik** topildi (4 kritik, 7 yuqori, ~20 o'rta, qolgani past/info).
- Barcha kritik/yuqori va muhim o'rta xatolar **tuzatildi**.
- Tizim **server-authoritative** (auditga chidamli) arxitekturaga o'tkazildi.
- Yo'qolgan modullar qaytarildi, ranglaringiz (Forest Gold) saqlandi.
- **Real emulyator testlari** yozildi va o'tdi: **Rules 41/41**, **Functions+migratsiya 21/21**.
- Web va Functions **TypeScript** to'liq toza (`tsc` xatosiz).

---

## 1) Audit natijalari (topilgan asosiy muammolar)

### 🔴 Kritik
1. **`voidPurchase` umuman ishlamasdi** — Firestore tranzaksiyasida o'qish/yozuv tartibi buzilgan (ko'p mahsulotli/ta'minotchili kirimni bekor qilib bo'lmasdi).
2. **Haftalik/oylik hisobotlar bo'sh chiqardi** — Cloud Functions `createdAt`ни `Timestamp` bilan qidirardi, lekin u **raqam (ms)** sifatida saqlangan → 0 ta hujjat.
3. **Offline savdo dublikati** — tarmoq uzilganda savdo ikki marta yozilib, ombor/kassa/qarz buzilishi mumkin edi (idempotentlik yo'q).
4. (Yengil versiyada) **Kassir umuman savdo qila olmasligi** — rules `stock_movements`ни noto'g'ri talab qilardi.

### 🟠 Yuqori
5. **Telegram webhook xavfsizligi** — sarlavhani tashlab yuborib tekshiruvni chetlab o'tish mumkin edi.
6. **`voidPurchase` rollback** keyingi savdo/kirimlarni o'chirib yuborardi (eski snapshot bilan).
7. **Barcode unikalligi** — yangi mahsulotda dublikat barcode yaratilishi mumkin edi.
8. **Hisobot moliyasi** — `netRevenue`/foyda qaytarishlarni noto'g'ri hisoblardi; void savdo ikki marta jazolanardi.

### 🟡 O'rta (asosiylari)
- "**Qarz**" tugmasi to'liq to'langan naqd savdo yozardi (qarz qayd etilmasdi).
- Void qilingan savdoga qaytarish bloklanmasdi (ikki marta refund).
- **PIN-gating** umuman ishlamasdi (claim nomi mos emas).
- `accountant` roli hech qanday ruxsatga ega emasdi.
- Mijoz to'lovi `serverTimestamp` bilan yozilib, hisobotga tushmasdi.
- `audit_logs` yozuvi rules tomonidan rad etilardi (audit-iz ishlamasdi).

> Past/info: `.env` repozitoriyga commit qilingan, XSS sinki, zaif `xlsx`, `.bak` fayllar, indekslar e'lon qilinmagan va h.k.

---

## 2) Bajarilgan tuzatishlar

| Soha | Tuzatish |
|---|---|
| Kirim/Savdo/Qaytarish/Bekor | Tranzaksiyalar to'g'ri (read→write), delta-reversal, idempotentlik, qaytarilgan-qty hisobi |
| Hisobot | `createdAt` raqam bo'yicha; void filtri; qaytarish/foyda **accrual** asosida |
| Telegram | Webhook secret fail-closed; PDF oqimi |
| Xavfsizlik | PIN claim to'g'rilandi (TTL bilan); accountant roli o'qishga ruxsat |
| POS | "Qarz" tugmasi to'g'ri qarz yozadi; barqaror operationId |
| Audit-iz | `audit_logs` server tomonida yoziladi (kim/qachon/nima) |
| Tozalash | `.bak` fayllar, env falsy, mijoz balans maydon himoyasi |

---

## 3) Server-authoritative arxitektura (auditga chidamli)

Ombor/pul/qarzni o'zgartiruvchi **barcha amallar serverga** (Cloud Functions) ko'chirildi:
`createSaleTx, createPurchaseTx, createReturnTx, voidSaleTx, voidPurchaseTx, customerPaymentTx, supplierPaymentTx, expenseTx`.

- Har biri: **auth + rol + do'kon** tekshiradi, **atomar** tranzaksiya bajaradi, **audit-iz** yozadi.
- **Firestore rules**: client `sales/purchases/returns/cash_transactions/stock_movements/payments/expenses/audit_logs` ga **yoza olmaydi** (faqat o'qish). `products/customers/suppliers` da **balans/ombor maydonlari** himoyalangan.
- Natija: **buzilgan yoki qasddan o'zgartirilgan client ham kitobni buzolmaydi.**

**Muhim xulq-atvor:** savdo/kirim bekor (void) endi **faqat admin**; ombor sahifasi faqat o'qish (tovar faqat "Kirim" orqali).

---

## 4) Qaytarilgan modullar
Admin Dashboard, Ovozli harajat (STT), Mijoz savdo PDF — server-authoritative bilan moslab qaytarildi.

## 5) Ranglar
Sizning **asl versiyangiz** (Forest Gold: `#284B59` + oltin `#D8B45A`) asos qilindi — `styles.css`/`AppShell`/`Button`/`Modal`ga **tegilmadi**, shuning uchun ranglaringiz aynan saqlanadi.

---

## 6) Verifikatsiya (mashina bilan tekshirilgan)

| Tekshiruv | Natija |
|---|---|
| Web — `tsc -b` | ✅ toza (0) |
| Functions — `tsc --noEmit` | ✅ toza (0) |
| Rules emulyator testlari | ✅ **41/41** |
| Functions ledger + migratsiya testlari | ✅ **21/21** |

Testlar isbotlaydi: kirish matritsasi, ledger qulfi, balans himoyasi, multi-tenant, savdo/kirim/qaytarish/bekor mantig'i, idempotentlik, ruxsatlar, avgCost, ombor=harakatlar invarianti.

---

## 7) Migratsiya
`functions/scripts/migrateTimestamps.js` — eski `Timestamp` yozuvlarni **raqamga (ms)** o'tkazadi (hisobotda ko'rinishi uchun). Dry-run → APPLY. Ma'lumotni o'chirmaydi.

## 8) Reconcile (self-audit)
`web/src/services/reconcile.ts` — istalgan vaqtda kitob izchilligini qayta hisoblab tekshiradi (ombor=harakatlar, debt=bought−paid, balance=purchased−paid, kassa). (UI tugmasi ixtiyoriy — so'rasangiz qo'shaman.)

---

## 9) Deploy
`deploy.bat` (Windows) / `deploy.sh` (Mac/Linux): login → build → `firebase deploy` (functions + rules + hosting birga).
Deploydan oldin **backup** tavsiya etiladi.

> Ma'lumot (qarzdorlar) **o'chmaydi** — deploy faqat kod va ruxsatlarni yangilaydi.

---

## 10) Hali qolgan / sozlanishi kerak (kod emas, konfiguratsiya yoki ixtiyoriy)
- **PDF (Telegram)**: do'kon uchun Telegram bot ulanishi + owner chat sozlanishi kerak (BotFather token → connectShopBot → `/owner_on`). Telegramsiz "PDF yuklab olish" ishlaydi.
- Ixtiyoriy: Hisobotlar sahifasiga "Self-audit" tugmasi; kompozit indekslar; CI (avtomatik test/deploy).
