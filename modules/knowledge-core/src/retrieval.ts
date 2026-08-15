import type { AuthorityClass, DecisionEvidence, EmbeddingProvider, KnowledgeEvidence, KnowledgeQueryRequest, KnowledgeQueryResult, KnowledgeRepository, SearchHit, SourceRegistryAdapter } from "./contracts.js";

const authorityWeight: Record<AuthorityClass, number> = {
  "primary-authority": 1,
  "peer-reviewed": 0.95,
  "official-documentation": 0.9,
  "reputable-secondary": 0.75,
  community: 0.5,
  unknown: 0.3,
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function evidenceScore(hit: SearchHit): number {
  const retrieval = clamp(hit.retrievalScore);
  const authority = authorityWeight[hit.source.authorityClass];
  const freshness = clamp(hit.freshnessScore ?? 0.5);
  const verified = hit.document.verificationStatus === "verified" ? 1 : 0.4;
  return 0.55 * retrieval + 0.2 * authority + 0.15 * freshness + 0.1 * verified;
}

function toKnowledgeEvidence(hit: SearchHit): KnowledgeEvidence {
  return {
    kind: "knowledge",
    id: hit.chunk.id,
    score: evidenceScore(hit),
    title: hit.document.title,
    content: hit.chunk.content,
    projectScope: hit.document.projectScope ?? "global",
    provenance: {
      sourceId: hit.source.id,
      sourceName: hit.source.name,
      canonicalUrl: hit.document.canonicalUrl ?? hit.source.canonicalUrl,
      publisher: hit.source.publisher,
      authorityClass: hit.source.authorityClass,
      retrievedAt: hit.document.retrievedAt,
      publishedAt: hit.document.publishedAt,
      contentHash: hit.chunk.contentHash,
      verificationStatus: hit.document.verificationStatus,
      lifecycleStatus: hit.document.lifecycleStatus,
      licenseSpdx: hit.source.licenseSpdx,
      licenseUri: hit.source.licenseUri,
      untrustedSource: hit.document.untrustedSource,
    },
  };
}

function toDecisionEvidence(decision: DecisionEvidence): KnowledgeEvidence {
  return {
    kind: "decision",
    id: decision.id,
    score: decision.status.toLowerCase().includes("adopt") ? 0.98 : 0.82,
    title: decision.decisionKey,
    content: `${decision.decision}\n\nRationale: ${decision.rationale}`,
    projectScope: decision.projectScope,
    provenance: { decisionKey: decision.decisionKey, decidedAt: decision.decidedAt, status: decision.status, supersedes: decision.supersedes, evidence: decision.evidence },
  };
}

function dedupeEvidence(items: KnowledgeEvidence[], limit: number): KnowledgeEvidence[] {
  const seen = new Set<string>();
  return items.sort((a, b) => b.score - a.score).filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export async function queryKnowledge(
  request: KnowledgeQueryRequest,
  deps: { repository: KnowledgeRepository; embedder?: EmbeddingProvider; registry?: SourceRegistryAdapter },
): Promise<KnowledgeQueryResult> {
  const query = request.query.trim();
  if (!query) throw new Error("Knowledge query cannot be empty");
  const projectScope = request.projectScope ?? "global";
  const limit = Math.max(1, Math.min(request.limit ?? 8, 50));
  const candidateLimit = Math.min(limit * 2, 100);

  const [lexical, decisions] = await Promise.all([
    deps.repository.searchLexical(query, { projectScope, limit: candidateLimit }),
    deps.repository.searchDecisions(query, { projectScope, limit: Math.min(limit, 20) }),
  ]);

  let semantic: SearchHit[] = [];
  if (deps.embedder) {
    const [embedding] = await deps.embedder.embed([query]);
    if (!embedding) throw new Error("Embedding provider returned no query vector");
    semantic = await deps.repository.searchSemantic(embedding, { projectScope, limit: candidateLimit });
  }

  const evidence = dedupeEvidence([...lexical, ...semantic].map(toKnowledgeEvidence).concat(decisions.map(toDecisionEvidence)), limit);
  const bestScore = evidence[0]?.score ?? 0;
  const freshness = request.freshnessRequirement ?? "stable";
  const liveResearchRequired = freshness === "current" || freshness === "live" || bestScore < 0.55;
  const externalCandidates = [];

  if (deps.registry && request.registryCapabilities?.length && liveResearchRequired) {
    for (const capability of request.registryCapabilities) {
      externalCandidates.push(await deps.registry.resolve({ capability, input: { query, projectScope } }));
    }
  }

  return {
    evidence,
    externalCandidates,
    liveResearchRequired,
    route: { lexical: true, semantic: Boolean(deps.embedder), decisions: true, registry: externalCandidates.length > 0 },
  };
}
