# Firestore Rules — Emulator testlari

Bu testlar haqiqiy **Firestore emulyatorida** xavfsizlik qoidalarini tekshiradi
(server-authoritative model isboti): client ledger kolleksiyalariga yoza olmaydi,
balans/ombor maydonlari himoyalangan, ijara izolyatsiyasi ishlaydi.

## Talablar
- Node.js 18+
- Firebase CLI: `npm i -g firebase-tools`
- Java (Firestore emulyatori uchun) — `java -version` ishlashi kerak.

## Ishga tushirish

**AUDIT papkasidan** (firebase.json shu yerda):

```bash
firebase emulators:exec --only firestore "cd tests && npm install && npm test"
```

`emulators:exec` Firestore emulyatorini (port 8080) ko'taradi, testlarni ishga
tushiradi va so'ng emulyatorni o'chiradi. Hammasi yashil bo'lsa — qoidalar to'g'ri.

## Nimani tekshiradi
1. **Kirish matritsasi** — cashier/admin/accountant o'qiy oladi; boshqa shop / login qilmagan — yo'q.
2. **Ledger qulfi** — `sales, purchases, returns, cash_transactions, stock_movements,
   supplier_payments, customer_payments, expenses, audit_logs` ga client (admin ham) YOZA OLMAYDI.
3. **Products** — admin katalogni tahrirlaydi, lekin `stock`/`avgCost` ni o'zgartira olmaydi; yangi mahsulot faqat stock=0 bilan.
4. **Customers/Suppliers** — balans maydonlari (debt/balance/...) client tomonidan o'zgartirilmaydi.
5. **Multi-tenant** — boshqa shop ma'lumotiga kirib bo'lmaydi.
6. **Users** — foydalanuvchi o'zini admin qila olmaydi, boshqa user yarata olmaydi.

## Eslatma
Bu testlar **qoidalarni** tekshiradi (client xavfsizligi). Cloud Functions ichidagi
biznes-mantiq (ombor/pul hisob-kitobi) admin SDK orqali ishlaydi va qoidalarni
chetlab o'tadi — uni tekshirish uchun alohida Functions-emulator integratsion testlari
kerak (keyingi bosqich).
