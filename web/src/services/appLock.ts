export type AppLockMode = "pin" | "biometric" | "pin_or_biometric";

export type AppLockConfig = {
  enabled: boolean;
  mode: AppLockMode;
  autoLockMinutes: number;
  pinHash?: string;
  recoveryHash?: string;
  biometricCredentialId?: string; // base64url
  updatedAt: number;
};

const DEFAULT_CONFIG: AppLockConfig = {
  enabled: false,
  mode: "pin_or_biometric",
  autoLockMinutes: 5,
  updatedAt: 0,
};

function cfgKey(uid: string) {
  return `alibiz:applock:${uid}:v1`;
}

function unlockTsKey(uid: string) {
  return `alibiz:applock:unlock-ts:${uid}:v1`;
}

function unlockTsPersistKey(uid: string) {
  return `alibiz:applock:unlock-ts-persist:${uid}:v1`;
}

function hasWindow() {
  return typeof window !== "undefined";
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function randomBytes(n: number) {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(s: string): Uint8Array {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256(text: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return toHex(digest);
}

export function getAppLockConfig(uid: string): AppLockConfig {
  if (!hasWindow() || !uid) return DEFAULT_CONFIG;
  const raw = window.localStorage.getItem(cfgKey(uid));
  const cfg = safeParse<AppLockConfig>(raw, DEFAULT_CONFIG);
  return {
    ...DEFAULT_CONFIG,
    ...cfg,
    autoLockMinutes:
      typeof cfg.autoLockMinutes === "number" && cfg.autoLockMinutes >= 1 && cfg.autoLockMinutes <= 240
        ? cfg.autoLockMinutes
        : DEFAULT_CONFIG.autoLockMinutes,
  };
}

export function saveAppLockConfig(uid: string, patch: Partial<AppLockConfig>): AppLockConfig {
  if (!uid) return DEFAULT_CONFIG;
  const curr = getAppLockConfig(uid);
  const next: AppLockConfig = {
    ...curr,
    ...patch,
    updatedAt: Date.now(),
  };
  if (hasWindow()) {
    window.localStorage.setItem(cfgKey(uid), JSON.stringify(next));
  }
  return next;
}

export async function setAppLockPin(uid: string, pin: string): Promise<AppLockConfig> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN 4-8 raqam bo'lishi kerak");
  const pinHash = await sha256(pin);
  return saveAppLockConfig(uid, {
    pinHash,
    enabled: true,
    mode: "pin_or_biometric",
  });
}

export async function verifyAppLockPin(uid: string, pin: string): Promise<boolean> {
  const cfg = getAppLockConfig(uid);
  if (!cfg.pinHash) return false;
  const h = await sha256(pin);
  return h === cfg.pinHash;
}

export async function generateRecoveryCode(uid: string): Promise<{ code: string; config: AppLockConfig }> {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (i === 4) code += "-";
  }
  const recoveryHash = await sha256(code);
  const config = saveAppLockConfig(uid, { recoveryHash });
  return { code, config };
}

export async function verifyRecoveryCode(uid: string, code: string): Promise<boolean> {
  const cfg = getAppLockConfig(uid);
  if (!cfg.recoveryHash) return false;
  const norm = code.toUpperCase().replace(/\s+/g, "");
  const h = await sha256(norm);
  return h === cfg.recoveryHash;
}

export function markAppUnlocked(uid: string) {
  if (!hasWindow() || !uid) return;
  const now = String(Date.now());
  window.sessionStorage.setItem(unlockTsKey(uid), now);
  // Safari/PWA refreshda sessionStorage ba'zan yo'qolib qolishi mumkin.
  // Fallback sifatida localStorage'da ham saqlaymiz.
  window.localStorage.setItem(unlockTsPersistKey(uid), now);
}

export function forceAppLock(uid: string) {
  if (!hasWindow() || !uid) return;
  window.sessionStorage.removeItem(unlockTsKey(uid));
  window.localStorage.removeItem(unlockTsPersistKey(uid));
}

function readUnlockTimestamp(uid: string): number {
  const sessionRaw = window.sessionStorage.getItem(unlockTsKey(uid));
  const sessionTs = Number(sessionRaw || 0);
  if (sessionTs && !Number.isNaN(sessionTs)) return sessionTs;

  const persistedRaw = window.localStorage.getItem(unlockTsPersistKey(uid));
  const persistedTs = Number(persistedRaw || 0);
  if (persistedTs && !Number.isNaN(persistedTs)) {
    // keyingi tekshiruvlar uchun sessionStorage'ga ham qayta yozamiz
    window.sessionStorage.setItem(unlockTsKey(uid), String(persistedTs));
    return persistedTs;
  }

  return 0;
}

export function isAppLocked(uid: string): boolean {
  if (!uid || !hasWindow()) return false;
  const cfg = getAppLockConfig(uid);
  if (!cfg.enabled) return false;

  const ts = readUnlockTimestamp(uid);
  if (!ts || Number.isNaN(ts)) return true;

  const maxMs = Math.max(1, cfg.autoLockMinutes || 5) * 60 * 1000;
  return Date.now() - ts > maxMs;
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("PublicKeyCredential" in window) || !window.isSecureContext) return false;
  try {
    // @ts-ignore - static method may not be in older TS lib
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
      // @ts-ignore
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch {
    return false;
  }
}

export async function registerBiometric(uid: string): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false;

  const challenge = randomBytes(32);
  const userId = randomBytes(16);

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: { name: "Pult Uz" },
    user: {
      id: userId,
      name: `user-${uid}`,
      displayName: "Pult Uz User",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) return false;

  const idBytes = new Uint8Array(credential.rawId);
  saveAppLockConfig(uid, {
    biometricCredentialId: toBase64Url(idBytes),
    enabled: true,
    mode: "pin_or_biometric",
  });

  return true;
}

export async function verifyBiometric(uid: string): Promise<boolean> {
  const cfg = getAppLockConfig(uid);
  if (!cfg.biometricCredentialId) return false;
  if (!(await isBiometricAvailable())) return false;

  const credentialId = fromBase64Url(cfg.biometricCredentialId);
  // Ensure exact ArrayBuffer instance for stricter TS lib definitions
  const credentialIdBuffer = credentialId.buffer.slice(
    credentialId.byteOffset,
    credentialId.byteOffset + credentialId.byteLength
  ) as ArrayBuffer;
  const challenge = randomBytes(32);

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge,
    allowCredentials: [{ id: credentialIdBuffer, type: "public-key" }],
    userVerification: "required",
    timeout: 45_000,
  };

  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  return !!assertion;
}

export function appLockSummary(uid: string): {
  enabled: boolean;
  hasPin: boolean;
  hasBiometric: boolean;
  mode: AppLockMode;
  autoLockMinutes: number;
} {
  const cfg = getAppLockConfig(uid);
  return {
    enabled: cfg.enabled,
    hasPin: !!cfg.pinHash,
    hasBiometric: !!cfg.biometricCredentialId,
    mode: cfg.mode,
    autoLockMinutes: cfg.autoLockMinutes,
  };
}
