import type { KnowledgeSourceInput } from "./contracts.js";
import type { FileIngestionRequest } from "./file-ingest.js";
import type { TextIngestionRequest } from "./ingest.js";
import type { AuthorizedConsumer } from "./runtime-auth.js";
import type { UrlIngestionRequest } from "./url-ingest.js";

export type RuntimeIngestionRequest = TextIngestionRequest | UrlIngestionRequest | FileIngestionRequest;

function projectSourceType(project: string, sourceType: string): string {
  const prefix = `project:${project}:`;
  const available = Math.max(1, 240 - prefix.length);
  return `${prefix}${sourceType.slice(0, available)}`;
}

function bindConsumerSource(source: KnowledgeSourceInput, project: string): KnowledgeSourceInput {
  return {
    ...source,
    sourceType: projectSourceType(project, source.sourceType),
    authorityClass: "unknown",
    metadata: {
      ...source.metadata,
      neoosTrustDomain: "project",
      neoosProjectScope: project,
      neoosReportedAuthorityClass: source.authorityClass,
    },
  };
}

function bindConsumer(input: RuntimeIngestionRequest, project: string): RuntimeIngestionRequest {
  return {
    ...input,
    source: bindConsumerSource(input.source, project),
    document: {
      ...input.document,
      projectScope: project,
      verificationStatus: "unverified",
      lifecycleStatus: "ingested",
      metadata: {
        ...input.document.metadata,
        neoosTrustDomain: "project",
        neoosProjectScope: project,
        neoosReportedVerificationStatus: input.document.verificationStatus,
        neoosReportedLifecycleStatus: input.document.lifecycleStatus,
      },
    },
  } as RuntimeIngestionRequest;
}

function bindAdmin(input: RuntimeIngestionRequest, project: string): RuntimeIngestionRequest {
  const verification = input.document.verificationStatus ?? "unverified";
  const lifecycle = input.document.lifecycleStatus ?? "ingested";
  if ((lifecycle === "verified" || lifecycle === "active") && verification !== "verified") {
    throw new Error("verified or active lifecycle requires verified status");
  }
  return {
    ...input,
    source: {
      ...input.source,
      metadata: { ...input.source.metadata, neoosTrustDomain: "governed" },
    },
    document: {
      ...input.document,
      projectScope: project,
      verificationStatus: verification,
      lifecycleStatus: lifecycle,
      metadata: { ...input.document.metadata, neoosTrustDomain: "governed" },
    },
  } as RuntimeIngestionRequest;
}

export function bindRuntimeTrust(
  input: RuntimeIngestionRequest,
  auth: AuthorizedConsumer,
  project: string,
): RuntimeIngestionRequest {
  return auth.admin ? bindAdmin(input, project) : bindConsumer(input, project);
}
