# Pult Uz — ichki ish dasturi

**Pult Uz** do'koni uchun to'liq ichki boshqaruv tizimi: **Savdo (kassa) + Ombor + Kirim + Mijozlar + Buyurtmalar + Ishchilar + Hisobotlar + Chek + Audit-iz**.

Sayt ichida ishlaydi (PWA) — **telefon va kompyuterdan** kirish mumkin. Firebase bilan ishlaydi: **Auth + Firestore + Cloud Functions + Hosting**.

---

## Asosiy bo'limlar

| Bo'lim | Nima qiladi |
|---|---|
| **KASSA (Savdo)** | Mahsulot sotish, savatda **narxni qo'lda o'zgartirish**, naqd/karta/nasiya, mijozga bog'lash, chek chiqarish |
| **OMBOR** | Qoldiqlar, kam qolgan mahsulot ogohlantirishi (qizil), qidiruv, barcode skaner |
| **KIRIM** | Mahsulot kirim qilish (yangi mahsulot shu yerdan yaratiladi: nom, brend, model, tur, izoh, kelgan/sotish narxi, shtrix-kod) |
| **MIJOZ** | Ism, telefon, xaridlar tarixi, qarzdorlik, nasiya yozish, qarz yopish, mijoz bo'yicha hisobot |
| **BUYURTMA** | Online/offline buyurtmalar, holatlar: yangi → tayyorlanmoqda → yetkazildi / bekor qilindi, oylik hisobot |
| **HODIMLAR** | So'rovni tasdiqlash, ruxsat darajasi: **admin / sotuvchi / omborchi / faqat ko'ruvchi** |
| **HISOBOT** | Kunlik/oylik foyda va savdo, naqd/karta/nasiya ajratmasi, eng ko'p/kam sotilgan mahsulotlar, sotuvchi bo'yicha, Excel/PDF |
| **TARIX** | Kassa tarixi, ombor harakatlari, har bir amal audit-izda (kim, qachon, nima) |

## Narxni qo'lda o'zgartirish (muhim!)

Har bir savdoda savatdagi narxni o'zgartirish mumkin (oddiy/ulgurji/tanish xaridorga har xil narx, kerak bo'lsa tan narxda ham).
Tizim **kelgan narxni saqlab qoladi** va **foydani avtomatik hisoblaydi**:

> Kelgan narx 8 000, standart narx 15 000. Savdoda 13 000 qilinsa — foyda 5 000; 20 000 qilinsa — foyda 12 000. Hammasi avtomatik, o'zgartirilgan narx audit-izda ko'rinadi (kim, qachon, qaysi narxda sotdi).

## Qidiruv (YouTube uslubida)

Yuqoridagi qidiruv maydoniga yozishni boshlaganingizda pastida o'xshash mahsulotlar chiqadi.
Qidiruv **nom, model, tur, brend, izoh va shtrix-kod** bo'yicha ishlaydi.
Masalan "Artel" yozilsa — barcha Artel pultlari; "Yasin" yozilsa — Yasin ko'k, Yasin 007 va h.k.

## Ruxsat darajalari

| Rol | Ko'radi/qiladi |
|---|---|
| **Admin** | Hammasi (savdo bekor qilish, kirim bekor, harajat, hodimlar, hisobotlar) |
| **Sotuvchi** | Kassa, ombor (ko'rish), mijozlar, buyurtmalar, kassa tarixi |
| **Omborchi** | Kirim, ombor, ta'minotchilar, buyurtmalar |
| **Faqat ko'ruvchi** | Ombor, mijozlar, buyurtmalar, hisobotlar — hech narsani o'zgartira olmaydi |

Rollarni **HODIMLAR** bo'limida admin belgilaydi (tasdiqlashda ham, keyin ham o'zgartirsa bo'ladi). Ruxsatlar serverda (Cloud Functions + Firestore rules) majburlanadi — buzilgan client ham chetlab o'ta olmaydi.

## Xavfsizlik va audit

- Ombor/pul/qarzni o'zgartiruvchi **barcha amallar server tomonda** (Cloud Functions) bajariladi — atomar tranzaksiyalar.
- `stock_movements` va `cash_transactions` — **o'zgarmas** audit izlari.
- `audit_logs` — kim mahsulot qo'shdi, kim sotdi, kim narxni o'zgartirdi — hammasi yoziladi.
- **Self-audit**: yarashtirish (reconcile) barcha invariantlarni qayta tekshiradi.
- Batafsil: `AUDIT_PLATFORM.md`.

---

## O'rnatish

### Talablar
- Node.js 18+
- Firebase loyihasi (Auth + Firestore + Functions + Hosting yoqilgan)

### 1) Frontend
```bash
cd web
npm i
cp .env.example .env   # Firebase konfiguratsiyani to'ldiring
npm run dev
```

### 2) Cloud Functions
```bash
cd functions
npm i
npm run build
```

### 3) Deploy (hosting + functions + rules)
```bash
cd web && npm i && npm run build
cd ../functions && npm i && npm run build
cd ..
firebase deploy
```

### 4) Birinchi admin
1. Ro'yxatdan o'ting (Login sahifasi).
2. Firestore'da `users/{uid}` hujjatida: `role: "admin"`, `shopId: "<do'kon id>"`.
3. Qolgan hodimlar "Hodim bo'lish" so'rovi yuboradi — admin HODIMLAR bo'limida rol tanlab tasdiqlaydi.

## Backup (ma'lumot yo'qolmasligi uchun)

Firestore avtomatik replikatsiya qiladi, qo'shimcha nusxa uchun:
```bash
gcloud firestore export gs://<PROJECT_ID>.appspot.com/backups/$(date +%F)
```
Buni haftada bir marta (yoki Cloud Scheduler bilan avtomatik) bajarish tavsiya etiladi.

## Testlar

```bash
# Firestore rules testlari
firebase emulators:exec --only firestore "cd tests && npm install && npm test"
# Functions integratsion testlari
firebase emulators:exec --only firestore "cd functions && npm install && npm test"
```

## Chek chiqarish

Savdo yakunlangach chek oynasi ochiladi: **do'kon nomi (PULT UZ), sana, mahsulotlar, soni, narxi, jami summa, to'lov turi (naqd/karta/nasiya), sotuvchi ismi**. Printerga chiqarish yoki PDF sifatida saqlash mumkin (brauzer print → Save as PDF). Telegram orqali mijozga yuborish uchun `README/README_TELEGRAM_BOT.txt` ga qarang.
