export function env(key: string): string {
  const v = import.meta.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return String(v);
}
export function envOptional(key: string, fallback = ""): string {
  const v = import.meta.env[key];
  return v ? String(v) : fallback;
}
