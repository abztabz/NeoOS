import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { EmbeddingProvider, KnowledgeRepository } from "./contracts.js";
import { ingestText, type TextIngestionRequest, type TextIngestionResult } from "./ingest.js";

export interface ResolvedAddress { address: string; family: number; }
export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface UrlIngestionPolicy {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allowedHosts?: string[];
  resolver?: HostResolver;
  fetchImpl?: typeof fetch;
}

export interface UrlIngestionRequest extends Omit<TextIngestionRequest, "content"> {
  url: string;
}

const defaultResolver: HostResolver = async (hostname) =>
  await lookup(hostname, { all: true, order: "verbatim" }) as ResolvedAddress[];

function parseIPv4(address: string): number[] | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  const numbers = parts.map(Number);
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return numbers;
}

export function isPublicNetworkAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const family = isIP(normalized);
  if (family === 4) {
    const octets = parseIPv4(normalized);
    if (!octets) return false;
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family === 6) {
    if (normalized === "::" || normalized === "::1") return false;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
    if (/^fe[89ab]/.test(normalized)) return false;
    if (normalized.startsWith("ff")) return false;
    if (normalized.startsWith("2001:db8:")) return false;
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      return isPublicNetworkAddress(mapped);
    }
    return true;
  }
  return false;
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function hostAllowed(hostname: string, allowedHosts?: string[]): boolean {
  if (!allowedHosts?.length) return true;
  const host = normalizeHost(hostname);
  return allowedHosts.some((allowed) => host === normalizeHost(allowed));
}

function rejectReservedHostname(hostname: string): void {
  const host = normalizeHost(hostname);
  if (!host || host === "localhost") throw new Error("URL host is not allowed");
  const blockedSuffixes = [".localhost", ".local", ".internal", ".lan", ".home", ".invalid", ".test", ".example", ".onion"];
  if (blockedSuffixes.some((suffix) => host.endsWith(suffix))) throw new Error("URL host is not allowed");
}

async function validateTarget(url: URL, policy: UrlIngestionPolicy): Promise<void> {
  if (url.protocol !== "https:") throw new Error("Knowledge URL ingestion requires HTTPS");
  if (url.username || url.password) throw new Error("Knowledge URL must not contain credentials");
  if (url.port && url.port !== "443") throw new Error("Knowledge URL must use the standard HTTPS port");
  rejectReservedHostname(url.hostname);
  if (!hostAllowed(url.hostname, policy.allowedHosts)) throw new Error("URL host is outside the ingestion allowlist");

  const host = normalizeHost(url.hostname);
  if (isIP(host)) {
    if (!isPublicNetworkAddress(host)) throw new Error("URL resolves to a non-public network address");
    return;
  }

  const addresses = await (policy.resolver ?? defaultResolver)(host);
  if (!addresses.length) throw new Error("URL host did not resolve to an address");
  if (addresses.some(({ address }) => !isPublicNetworkAddress(address))) {
    throw new Error("URL host resolves to a non-public network address");
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Knowledge URL response exceeds the size limit");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("Knowledge URL response exceeds the size limit");
      throw new Error("Knowledge URL response exceeds the size limit");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function htmlToText(html: string): string {
  const withoutInactive = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ");
  return decodeEntities(withoutInactive.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractText(raw: string, contentType: string): string {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mediaType === "text/html" || mediaType === "application/xhtml+xml") return htmlToText(raw);
  if (mediaType.startsWith("text/") || mediaType === "application/json") return raw.trim();
  throw new Error(`Unsupported URL content type: ${mediaType || "missing"}`);
}

async function fetchGovernedUrl(input: string, policy: UrlIngestionPolicy): Promise<{ finalUrl: string; contentType: string; text: string }> {
  const fetchImpl = policy.fetchImpl ?? fetch;
  const maxBytes = Math.max(1_024, Math.min(policy.maxBytes ?? 2_000_000, 10_000_000));
  const timeoutMs = Math.max(500, Math.min(policy.timeoutMs ?? 10_000, 30_000));
  const maxRedirects = Math.max(0, Math.min(policy.maxRedirects ?? 3, 5));
  let current = new URL(input);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await validateTarget(current, policy);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "text/html,text/plain,text/markdown,application/json,application/xhtml+xml;q=0.9,*/*;q=0.1" },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount >= maxRedirects) throw new Error("Knowledge URL exceeded the redirect limit");
      const location = response.headers.get("location");
      if (!location) throw new Error("Knowledge URL redirect is missing a location");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`Knowledge URL fetch failed with HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") ?? "";
    const raw = await readBounded(response, maxBytes);
    const text = extractText(raw, contentType);
    if (!text) throw new Error("Knowledge URL contained no ingestible text");
    return { finalUrl: current.toString(), contentType, text };
  }
  throw new Error("Knowledge URL exceeded the redirect limit");
}

export async function ingestUrl(
  request: UrlIngestionRequest,
  deps: { repository: KnowledgeRepository; embedder?: EmbeddingProvider; policy?: UrlIngestionPolicy; now?: () => Date },
): Promise<TextIngestionResult> {
  const fetched = await fetchGovernedUrl(request.url, deps.policy ?? {});
  const requestedUrl = new URL(request.url).toString();
  return await ingestText({
    ...request,
    source: {
      ...request.source,
      canonicalUrl: fetched.finalUrl,
      metadata: { ...request.source.metadata, requestedUrl, finalUrl: fetched.finalUrl },
    },
    document: {
      ...request.document,
      canonicalUrl: fetched.finalUrl,
      mimeType: fetched.contentType.split(";", 1)[0]?.trim().toLowerCase(),
      metadata: { ...request.document.metadata, requestedUrl, finalUrl: fetched.finalUrl },
    },
    content: fetched.text,
  }, { repository: deps.repository, embedder: deps.embedder, now: deps.now });
}
