export type AuthorityClass =
  | "primary-authority"
  | "peer-reviewed"
  | "official-documentation"
  | "reputable-secondary"
  | "community"
  | "unknown";

export type LifecycleStatus =
  | "candidate"
  | "ingested"
  | "verified"
  | "active"
  | "challenged"
  | "superseded"
  | "archived";

export type FreshnessRequirement = "historical" | "stable" | "current" | "live";
export type VerificationStatus = "unverified" | "verified" | "challenged";
export type EvidenceKind = "knowledge" | "decision" | "external-candidate";

export interface KnowledgeSourceInput {
  name: string;
  sourceType: string;
  canonicalUrl?: string;
  publisher?: string;
  authorityClass: AuthorityClass;
  licenseSpdx?: string;
  licenseUri?: string;
  freshnessPolicy?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeDocumentInput {
  title: string;
  author?: string;
  publishedAt?: string;
  retrievedAt: string;
  canonicalUrl?: string;
  mimeType?: string;
  language?: string;
  projectScope?: string;
  knowledgeDomain?: string;
  verificationStatus?: VerificationStatus;
  lifecycleStatus?: LifecycleStatus;
  licenseStatus?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredSource extends KnowledgeSourceInput { id: string; }
export interface StoredDocument extends KnowledgeDocumentInput {
  id: string;
  sourceId: string;
  contentHash: string;
  untrustedSource: boolean;
}

export interface ChunkInput {
  chunkIndex: number;
  content: string;
  contentHash: string;
  section?: string;
  pageNumber?: number;
  embedding?: number[];
  embeddingModel?: string;
  embeddingDimensions?: number;
  metadata?: Record<string, unknown>;
}
export interface StoredChunk extends ChunkInput { id: string; documentId: string; }

export interface DecisionEvidence {
  id: string;
  decisionKey: string;
  projectScope: string;
  decision: string;
  rationale: string;
  status: string;
  decidedAt: string;
  supersedes?: string;
  evidence?: unknown[];
}

export interface SearchHit {
  chunk: StoredChunk;
  document: StoredDocument;
  source: StoredSource;
  retrievalScore: number;
  freshnessScore?: number;
}

export interface KnowledgeEvidence {
  kind: EvidenceKind;
  id: string;
  score: number;
  title: string;
  content: string;
  projectScope: string;
  provenance: Record<string, unknown>;
}

export interface KnowledgeQueryRequest {
  query: string;
  projectScope?: string;
  freshnessRequirement?: FreshnessRequirement;
  limit?: number;
  registryCapabilities?: string[];
}

export interface RegistryRequest {
  capability: string;
  input: Record<string, unknown>;
  allowExperimental?: boolean;
}
export interface RegistryResponse {
  capability: string;
  selectedProvider?: string;
  observationTimestamp: string;
  sourceObservationTimestamp?: string;
  durationMs?: number;
  provenance: Record<string, unknown>;
  data?: unknown;
  failedAttempts?: unknown[];
}

export interface KnowledgeQueryResult {
  evidence: KnowledgeEvidence[];
  externalCandidates: RegistryResponse[];
  liveResearchRequired: boolean;
  route: { lexical: boolean; semantic: boolean; decisions: boolean; registry: boolean; };
}

export interface EmbeddingProvider {
  readonly providerId: string;
  readonly modelId: string;
  embed(texts: string[]): Promise<number[][]>;
}

export interface KnowledgeRepository {
  upsertSource(source: KnowledgeSourceInput): Promise<StoredSource>;
  insertDocument(input: KnowledgeDocumentInput & { sourceId: string; contentHash: string; untrustedSource: boolean }): Promise<StoredDocument>;
  insertChunks(documentId: string, chunks: ChunkInput[]): Promise<StoredChunk[]>;
  searchLexical(query: string, options: { projectScope: string; limit: number }): Promise<SearchHit[]>;
  searchSemantic(embedding: number[], options: { projectScope: string; limit: number }): Promise<SearchHit[]>;
  searchDecisions(query: string, options: { projectScope: string; limit: number }): Promise<DecisionEvidence[]>;
}

export interface SourceRegistryAdapter {
  resolve(request: RegistryRequest): Promise<RegistryResponse>;
}
