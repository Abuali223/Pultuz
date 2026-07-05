TELEGRAM BOT (Mijozga shaxsiy savdo xabari)
=========================================

Maqsad:
- Mijoz botga /start qiladi va telefonini Kontakt (share contact) qilib yuboradi
- Bot telefon orqali mijozni Firestore'dan topadi va shu mijozga telegramChatId ni bog'laydi
- Keyingi savdolarda (agar savdoda customer tanlangan bo'lsa) xabar shaxsan mijozga boradi
- Do'kon egasiga (ownerChatId) esa barcha savdolar kelib turadi

1) Sozlash (Functions env)
------------------------
Cloud Functions environment variable:
- TELEGRAM_BOT_TOKEN = (BotFather bergan token)

Windows/Mac/Linux terminal:
  firebase functions:config:set telegram.token="YOUR_TOKEN"
  firebase deploy --only functions

Agar env orqali ishlatsangiz (GitHub Actions / server):
  TELEGRAM_BOT_TOKEN=YOUR_TOKEN

Eslatma: Bu loyihada token `process.env.TELEGRAM_BOT_TOKEN` dan olinadi.

2) Webhook sozlash
------------------
Deploy qilgandan keyin URL chiqadi:
  https://<region>-<project>.cloudfunctions.net/telegramWebhook

Webhook o'rnatish:
  https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=<YOUR_WEBHOOK_URL>

3) Firestore settings
---------------------
Admin panel yoki Firestore Console'da:
  shops/{shopId}/settings/telegram

Maydonlar:
  enabled: true
  ownerChatId: "123456789"  (do'kon egasining chatId)
  notifyCustomer: true

Owner chatId ni bilish:
- Telegramda botga oddiy xabar yozing
- Functions loglarida chatId ko'rinadi yoki webhook update ichidan olasiz

4) Mijozni ulash (link)
-----------------------
Mijoz botga yozadi:
  /start default
Keyin "📱 Telefon raqamni yuborish" tugmasini bosib kontakt yuboradi.

5) Muhim
---------
- Mijoz Firestore'da oldin mavjud bo'lishi kerak (kassadan qo'shilgan bo'lsa)
- Telefon mos tushishi uchun customer hujjatida `phoneNorm` yoziladi.
  Bu loyiha createCustomer()da avtomatik yozadi.

