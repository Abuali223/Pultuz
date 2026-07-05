import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence,
} from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { env, envOptional } from "./env";

const firebaseConfig = {
  apiKey: env("VITE_FIREBASE_API_KEY"),
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: env("VITE_FIREBASE_PROJECT_ID"),
  // Newer Firebase projects may use the `.firebasestorage.app` default bucket.
  // Keep env override but fall back to `${projectId}.firebasestorage.app`.
  storageBucket: envOptional(
    "VITE_FIREBASE_STORAGE_BUCKET",
    `${env("VITE_FIREBASE_PROJECT_ID")}.firebasestorage.app`
  ),
  messagingSenderId: envOptional("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("VITE_FIREBASE_APP_ID"),
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ✅ Offline persistence (IndexedDB cache)
// Bu internet uzilib qolganida ham savdo/mijoz/kirim yozuvlari vaqtincha brauzerda saqlanib turishini ta'minlaydi.
// Internet qaytishi bilan Firestore o'zi avtomatik sync qiladi.
// Eslatma: bir nechta tab ochilgan bo'lsa "failed-precondition" bo'lishi mumkin — shunda persistence o'chib ishlayveradi.
if (typeof window !== "undefined") {
  enableMultiTabIndexedDbPersistence(db).catch((err: any) => {
    // fallback: single-tab
    enableIndexedDbPersistence(db).catch(() => {
      // Persistenceni yoqib bo'lmasa ham app ishlaydi (shunchaki offline cache bo'lmaydi)
      if (import.meta?.env?.DEV) {
        console.warn("[Firestore] Offline persistence yoqilmadi:", err?.code || err);
      }
    });
  });
}
export const functions = getFunctions(app, envOptional("VITE_FIREBASE_REGION", "us-central1"));

export const storage = getStorage(app);
