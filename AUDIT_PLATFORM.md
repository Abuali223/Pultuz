# Audit Hisobchi Platforma — Model, Audit izi va Yarashtirish

Bu hujjat **tovar kirimi → ombor → savdo → chiqishi** zanjirining qanday qilib
**xatosiz va auditga chidamli** yuritilishini tushuntiradi.

---

## 1. Hayotiy tsikl (lifecycle)

```
  TA'MINOTCHI                          MIJOZ
      │                                  ▲
      │ Kirim (createPurchase)           │ Savdo (createSale)
      ▼                                  │
 ┌──────────┐   stock +qty / avgCost  ┌──────────┐  stock −qty
 │  KIRIM   │ ───────────────────────▶│  OMBOR   │ ───────────────▶  CHIQISH
 └──────────┘                          └──────────┘
      ▲                                  │  ▲
      │ voidPurchase (rollback)          │  │ qaytarish (createReturn) → stock +qty
      │                                  ▼  │ bekor (voidSale) → stock +qty (qaytarilmagan qism)
   supplier balance                    cash / debt
```

Har bir o'tish **bitta Firestore tranzaksiyasi** ichida bajariladi — ya'ni
ombor, pul va qarz **birga** yangilanadi yoki umuman yangilanmaydi (atomarlik).

---

## 2. Manbalar (source of truth) va ikki yozuvli iz

Har bir o'zgarish **ikki xil izda** qoldiriladi:

| Iz | Nima yozadi | Maqsad |
|---|---|---|
| `stock_movements` | Har bir ombor o'zgarishi (IN / OUT / RETURN / VOID_SALE / VOID_PURCHASE) | Ombor auditi |
| `cash_transactions` | Har bir pul harakati (SALE / REFUND / PURCHASE / PURCHASE_VOID / SUPPLIER_PAYMENT / CUSTOMER_PAYMENT / EXPENSE), ishorali `amount` | Kassa auditi |
| `audit_logs` | Har bir amal (kim, qachon, nima): SALE_CREATE, RETURN_CREATE, SALE_VOID, PURCHASE_CREATE, PURCHASE_VOID, SUPPLIER_PAYMENT, CUSTOMER_PAYMENT, EXPENSE_CREATE, STOCK_IN | "Kim qildi" auditi |

> **Muhim:** `stock_movements` va `cash_transactions` — **o'zgarmas** (immutable):
> Firestore rules ularni `update` qilishni taqiqlaydi. Shuning uchun ular
> ishonchli audit izi bo'lib xizmat qiladi.

### Invariantlar (har doim to'g'ri bo'lishi kerak)
1. **Ombor** (dona mahsulot) = `Σ stock_movements` (ishora bilan).
2. **Savdo**: `total = Σ item.lineTotal`, `paid + due = total`, `profit = Σ item.profit`.
3. **Mijoz**: `debt = totalBought − totalPaid`, `debt ≥ 0`.
4. **Ta'minotchi**: `balance = totalPurchased − totalPaid`.
5. **Kassa qoldig'i** = `Σ cash_transactions.amount`.

---

## 3. Self-audit (yarashtirish) — platformaning "auditor"i

`web/src/services/reconcile.ts` → `runReconciliation(shopId)` funksiyasi yuqoridagi
**barcha invariantlarni qayta hisoblab**, saqlangan qiymatlar bilan solishtiradi.

**Foydalanish:** Hisobotlar (Reports) sahifasida **"🔍 Self-audit"** tugmasini bosing.
- ✅ Agar hammasi izchil bo'lsa — "izchil (xato yo'q)".
- ⚠️ Aks holda har bir nomuvofiqlik jadvalda ko'rsatiladi: tur, obyekt, kutilgan, haqiqiy, farq.

Natija (`ReconReport`): `ok`, `counts`, `summary` (kassa qoldig'i, jami qarz, ombor qiymati)
va `issues[]`. Buni istalgan vaqtda ishga tushirib, kitoblarning to'g'riligini **isbotlash** mumkin.

---

## 4. Bu bosqichda nima qo'shildi / tuzatildi

- `audit.ts` tuzatildi: `createdBy` yoziladi (avval Firestore rules har bir audit yozuvini RAD etardi).
- Audit izi **barcha** hayotiy-tsikl amallariga ulandi (sales/purchase/void/return, supplier/customer payment, expense, stockIn).
- **Yarashtirish dvigateli** (`reconcile.ts`) qo'shildi + Reports sahifasiga "Self-audit" tugmasi.
- (Avvalgi bosqichda: voidPurchase/createReturn/voidSale read-after-write, hisobot Timestamp,
  savdo idempotentligi, telegram secret, barcode, accountant roli, "Qarz" tugmasi va h.k. — `CHANGELOG_FIXES.md` ga qarang.)

---

## 5. Server-authoritative — ✅ AMALGA OSHIRILDI

Ombor/pul/qarzni o'zgartiruvchi BARCHA amallar endi **server tomonda** (Cloud Functions,
`functions/src/ledger.ts`) bajariladi:

| Amal | Callable funksiya | Ruxsat |
|---|---|---|
| Savdo | `createSaleTx` | cashier/admin |
| Qaytarish | `createReturnTx` | cashier/admin |
| Savdo bekor | `voidSaleTx` | **admin** |
| Kirim | `createPurchaseTx` | **admin** |
| Kirim bekor | `voidPurchaseTx` | **admin** |
| Mijoz to'lovi | `customerPaymentTx` | cashier/admin |
| Ta'minotchi to'lovi | `supplierPaymentTx` | **admin** |
| Harajat | `expenseTx` | **admin** |

Har bir funksiya: auth + rol + shop mosligini tekshiradi, atomar tranzaksiya bajaradi,
audit-iz yozadi. Savdo va qaytarish **idempotent** (`operationId`).

**Firestore rules — client uchun faqat o'qish:** `sales`, `purchases`, `returns`,
`cash_transactions`, `stock_movements`, `supplier_payments`, `customer_payments`,
`expenses`, `audit_logs` — client `create/update` qila olmaydi (`if false`). `products`,
`customers`, `suppliers` — balans/ombor maydonlari (stock, avgCost, debt, balance, ...)
client tomonidan o'zgartirilmaydi; faqat ma'lumot maydonlari tahrirlanadi.

Natija: ombor/pul mantig'i bitta joyda (serverda). Buzilgan yoki qasddan o'zgartirilgan
client ham kitobni buzolmaydi.

### Muhim xulq-atvor o'zgarishlari
- **Savdo/kirim bekor (void) endi faqat ADMIN** qila oladi (server majburlaydi). Kassir
  PIN bilan ham bekor qila olmaydi — bu auditga chidamlilik uchun ataylab.
- **Inventar (Ombor) sahifasi faqat o'qish**: tovar faqat "Kirim" orqali (server) qo'shiladi.
- Client'dagi `products.createProduct/updateProduct/stockIn` funksiyalari endi
  ishlatilmaydi (server qoidalari tomonidan bloklangan) — ular o'rniga "Kirim" ishlatiladi.
- Callable funksiyalar `us-central1` mintaqasiga deploy bo'ladi — `web/.env` dagi
  `VITE_FIREBASE_REGION` shu bilan mos bo'lsin (yoki bo'sh qoldiring).

---

## 5.1 Testlar (verifikatsiya) — ✅ yashil

Loyiha **real emulyator testlari** bilan tekshiriladi:

- **Firestore Rules testlari** (`tests/`): 41 ta test — kirish matritsasi, ledger qulfi
  (client yoza olmaydi), balans maydonlari himoyasi, multi-tenant, user escalation.
  ```bash
  firebase emulators:exec --only firestore "cd tests && npm install && npm test"
  ```
- **Functions integratsion testlari** (`functions/test/`): 19 ta test — savdo/kirim/
  qaytarish/bekor/to'lov/harajat mantig'i, idempotentlik, ruxsatlar, avgCost,
  delta-reversal, ombor = harakatlar invarianti.
  ```bash
  firebase emulators:exec --only firestore "cd functions && npm install && npm test"
  ```
- **Type-check**: `cd web && npm i && npx tsc -b` va `cd functions && npm i && npx tsc --noEmit` — ikkalasi ham toza.

## 5.2 Qaytarilgan modullar
- **Admin Dashboard** (`/admin-dashboard`) — KPI ko'rinishi (navigatsiyada "DASHBOARD").
- **Ovozli harajat** — Harajatlar sahifasida "🎙️ Ovozli" (STT + `expenseTx` server orqali).
- **STT** (`sttUzbekVoice`) — ovozni matnga.
- **Mijoz savdo PDF** — Mijoz sahifasida "📄 PDF (Telegram)" (`sendCustomerSalesPdf`).

## 5.3 Migratsiya — eski Timestamp -> raqam (ms)

Eski yozuvlarda `createdAt`/`updatedAt` ba'zan Firestore `Timestamp` bo'lishi mumkin
(hisobotlar raqam bo'yicha filtrlaydi). `functions/scripts/migrateTimestamps.js` ularni
raqamga keltiradi. **Hujjatlarni o'chirmaydi, faqat Timestamp maydonlarni ms ga aylantiradi,
idempotent.**

```bash
# 1) Service account kalit: Firebase Console -> Project settings -> Service accounts -> Generate key -> sa.json
# 2) QURUQ ko'rish (hech narsa yozmaydi):
cd functions
GOOGLE_APPLICATION_CREDENTIALS=../sa.json GCLOUD_PROJECT=han-biznes-boshqaruv-1a41f node scripts/migrateTimestamps.js
# 3) To'g'ri bo'lsa, haqiqiy yozish:
GOOGLE_APPLICATION_CREDENTIALS=../sa.json GCLOUD_PROJECT=han-biznes-boshqaruv-1a41f APPLY=1 node scripts/migrateTimestamps.js
```
Migratsiya emulyator testi bilan tekshirilgan (`functions/test/migrate.test.ts`).

> **Tartib:** avval **backup** (5.4) → keyin migratsiyani **dry-run** → **APPLY**. Migratsiya
> deploydan oldin yoki keyin ishlashi mumkin (mustaqil, ma'lumotni buzmaydi).

## 5.4 Backup (deploydan oldin tavsiya)
```bash
gcloud firestore export gs://han-biznes-boshqaruv-1a41f.appspot.com/backups/$(date +%F)
```

## 6. Deploy

```bash
cd web && npm i && npm run build
cd ../functions && npm i && npm run build
firebase deploy            # hosting + functions + firestore rules
```
`firebase/firestore.rules` ham yangilangan — albatta deploy qiling.
