import { createHash } from "node:crypto";
import type { ChunkInput, EmbeddingProvider, KnowledgeDocumentInput, KnowledgeRepository, KnowledgeSourceInput, StoredChunk, StoredDocument, StoredSource } from "./contracts.js";

export interface TextIngestionRequest {
  source: KnowledgeSourceInput;
  document: Omit<KnowledgeDocumentInput, "retrievedAt"> & { retrievedAt?: string };
  content: string;
  chunkSize?: number;
  overlap?: number;
}
export interface TextIngestionResult { source: StoredSource; document: StoredDocument; chunks: StoredChunk[]; }

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function chunkText(content: string, chunkSize = 1800, overlap = 200): string[] {
  if (chunkSize < 300) throw new Error("chunkSize must be at least 300 characters");
  if (overlap < 0 || overlap >= chunkSize) throw new Error("overlap must be >= 0 and smaller than chunkSize");
  const normalized = normalizeText(content);
  if (!normalized) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(
        normalized.lastIndexOf("\n\n", end - 1),
        normalized.lastIndexOf(". ", end - 1),
        normalized.lastIndexOf("; ", end - 1),
      );
      if (boundary > start + Math.floor(chunkSize * 0.55)) end = boundary + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

export async function ingestText(
  request: TextIngestionRequest,
  deps: { repository: KnowledgeRepository; embedder?: EmbeddingProvider; now?: () => Date },
): Promise<TextIngestionResult> {
  const content = normalizeText(request.content);
  if (!content) throw new Error("Cannot ingest empty knowledge content");
  const source = await deps.repository.upsertSource(request.source);
  const contentHash = sha256(content);
  const retrievedAt = request.document.retrievedAt ?? (deps.now?.() ?? new Date()).toISOString();
  const document = await deps.repository.insertDocument({
    ...request.document,
    retrievedAt,
    sourceId: source.id,
    contentHash,
    untrustedSource: true,
    verificationStatus: request.document.verificationStatus ?? "unverified",
    lifecycleStatus: request.document.lifecycleStatus ?? "ingested",
    projectScope: request.document.projectScope ?? "global",
  });

  const rawChunks = chunkText(content, request.chunkSize, request.overlap);
  const embeddings = deps.embedder ? await deps.embedder.embed(rawChunks) : undefined;
  if (embeddings && embeddings.length !== rawChunks.length) throw new Error("Embedding provider returned a different number of vectors than chunks");

  const chunks: ChunkInput[] = rawChunks.map((chunk, chunkIndex) => {
    const embedding = embeddings?.[chunkIndex];
    return {
      chunkIndex,
      content: chunk,
      contentHash: sha256(chunk),
      embedding,
      embeddingModel: embedding ? `${deps.embedder?.providerId}/${deps.embedder?.modelId}` : undefined,
      embeddingDimensions: embedding?.length,
    };
  });

  return { source, document, chunks: await deps.repository.insertChunks(document.id, chunks) };
}
