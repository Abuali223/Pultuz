ALI BIZNES BOSHQARUV — INVENTORY (OMBOR) CAMERA SCANNER FIX

MUAMMO:
- `InventoryPage.tsx` ichida `CameraScannerModal` ga `description` prop berilgani uchun TypeScript build xato berardi.
- Shu build xato bo'lsa, `npm run build` muvaffaqiyatsiz bo'ladi, lekin siz `firebase deploy` qilsangiz eski `web/dist` deploy bo'lib ketadi (yangiliklar chiqmaydi).

NIMA QILINDI:
- `CameraScannerModal.tsx` ga `description?: string` qo'shildi.
- `InventoryPage.tsx` dagi takroriy (2 ta) `CameraScannerModal` blokidan biri olib tashlandi.

O'RNATISH:
- ZIP ichidagi `web/src/ui/CameraScannerModal.tsx` va `web/src/routes/InventoryPage.tsx` fayllarini loyihangizdagi xuddi shu yo'lga ko'chirib, ustidan yozib yuboring.
- So'ng:
  1) `cd web`
  2) `npm run build`
  3) `cd ..`
  4) `firebase deploy`
