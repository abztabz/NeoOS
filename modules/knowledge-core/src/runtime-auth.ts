import { createHash, timingSafeEqual } from "node:crypto";

export type RuntimeScope = "query" | "ingest" | "admin";
export type RuntimeEnv = Record<string, string | undefined>;
export type RuntimeHeaders = Record<string, string | string[] | undefined>;

export interface AuthorizedConsumer {
  consumer: string;
  projects: string[];
  admin: boolean;
}

interface ConsumerCredential {
  tokenSha256: string;
  scopes: RuntimeScope[];
  projects: string[];
}

const scopes = new Set<RuntimeScope>(["query", "ingest", "admin"]);

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function header(headers: RuntimeHeaders, name: string): string {
  const direct = headers[name.toLowerCase()] ?? headers[name];
  const found = direct ?? Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  return Array.isArray(found) ? found[0] ?? "" : found ?? "";
}

function consumerId(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized) ? normalized : "";
}

function projectId(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized === "*") return normalized;
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(normalized) ? normalized : "";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function tokenMatches(token: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(sha256(token)), encoder.encode(expectedHash.toLowerCase()));
}

function credentials(env: RuntimeEnv): Record<string, ConsumerCredential> {
  const raw = env.NEO_KNOWLEDGE_CONSUMERS?.trim();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!object(parsed)) return {};
    const output: Record<string, ConsumerCredential> = {};
    for (const [name, value] of Object.entries(parsed)) {
      const id = consumerId(name);
      if (!id || !object(value)) continue;
      const tokenSha256 = typeof value.tokenSha256 === "string" ? value.tokenSha256.trim().toLowerCase() : "";
      const allowedScopes = Array.isArray(value.scopes)
        ? value.scopes.filter((item): item is RuntimeScope => typeof item === "string" && scopes.has(item as RuntimeScope))
        : [];
      const projects = Array.isArray(value.projects) ? value.projects.map(projectId).filter(Boolean) : [];
      if (!/^[a-f0-9]{64}$/.test(tokenSha256) || allowedScopes.length === 0 || projects.length === 0) continue;
      output[id] = { tokenSha256, scopes: [...new Set(allowedScopes)], projects: [...new Set(projects)] };
    }
    return output;
  } catch {
    return {};
  }
}

export function authorizeRuntime(
  headers: RuntimeHeaders,
  env: RuntimeEnv,
  required: Exclude<RuntimeScope, "admin">,
): { ok: true; value: AuthorizedConsumer } | { ok: false; status: 401 | 403 | 503 } {
  const configured = credentials(env);
  if (Object.keys(configured).length === 0) return { ok: false, status: 503 };
  const consumer = consumerId(header(headers, "x-neo-consumer"));
  const authorization = header(headers, "authorization");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const credential = consumer ? configured[consumer] : undefined;
  if (!consumer || !token || !credential || !tokenMatches(token, credential.tokenSha256)) return { ok: false, status: 401 };
  const admin = credential.scopes.includes("admin");
  if (!admin && !credential.scopes.includes(required)) return { ok: false, status: 403 };
  return { ok: true, value: { consumer, projects: credential.projects, admin } };
}

export function resolveAuthorizedProject(requested: string | undefined, allowed: string[]): string | undefined {
  if (allowed.includes("*")) return requested ?? "global";
  if (requested) return allowed.includes(requested) ? requested : undefined;
  return allowed.length === 1 ? allowed[0] : undefined;
}
