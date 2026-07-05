ALI BIZNES BOSHQARUV — KIRIM SAQLANGANDA OMBOR AVTOMATIK YANGILANADI

NIMA QILADI?
- Kirim (tovar kelishi) saqlanganda har bir pozitsiya bo'yicha:
  1) `products/{productId}.stock` avtomatik +qty bo'ladi
  2) `products/{productId}.avgCost` (kelish narxi) weighted average bilan yangilanadi
  3) `stock_movements` kolleksiyasiga log yoziladi (IN)

BU NIMA UCHUN KERAK?
- Kirim kiritilganda omborga alohida qo'shish shart bo'lmaydi.
- Ombordagi qoldiq (stock) va kelish narxi to'g'ri yuradi.

QANDAY O'RNATILADI?
1) ZIP ichidagi `web/src/services/purchases.ts` va `web/src/services/products.ts` fayllarini
   o'zingizdagi shu yo'lga ko'chiring va eskisini overwrite qiling.
2) Keyin build va deploy:
   - Windows CMD:
     cd web
     npm i
     npm run build
     cd ..
     firebase deploy

MUHIM!
- Agar `npm run build` xato bersa, Firebase deploy baribir eski `web/dist` ni yuklab qo'yishi mumkin.
  Natijada siz o'zgartirgan kod saytda chiqmaydi.

TEKSHIRISH
- Kirim saqlagandan keyin Firestore -> shops/{shopId}/products/{productId} hujjatida `stock` oshganini ko'ring.
- `stock_movements` ichida yangi yozuv paydo bo'ladi.
