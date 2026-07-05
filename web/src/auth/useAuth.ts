// Re-export hook from AuthProvider.
// Some pages import from "@/auth/useAuth"; keeping this small file avoids
// having to touch many imports.

export { useAuth } from "./AuthProvider";
