import assert from "node:assert/strict";
import test from "node:test";
import type {
  ChunkInput,
  DecisionEvidence,
  KnowledgeDocumentInput,
  KnowledgeRepository,
  KnowledgeSourceInput,
  SearchHit,
  StoredChunk,
  StoredDocument,
  StoredSource,
} from "../src/contracts.js";
import { ingestUrl, isPublicNetworkAddress, type GovernedHttpsTransport, type HostResolver } from "../src/url-ingest.js";

async function expectReject(fn: () => Promise<unknown>, expectedMessage: string): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error, "Expected promise to reject with Error");
  assert.ok(caught.message.includes(expectedMessage), `Expected error to include: ${expectedMessage}`);
}

class MemoryRepository implements KnowledgeRepository {
  source: StoredSource = { id: "source-1", name: "Web", sourceType: "web", authorityClass: "unknown" };
  document?: StoredDocument;
  chunks: StoredChunk[] = [];

  async upsertSource(source: KnowledgeSourceInput): Promise<StoredSource> {
    this.source = { id: "source-1", ...source };
    return this.source;
  }

  async insertDocument(input: KnowledgeDocumentInput & { sourceId: string; contentHash: string; untrustedSource: boolean }): Promise<StoredDocument> {
    this.document = { id: "doc-1", ...input };
    return this.document;
  }

  async insertChunks(documentId: string, chunks: ChunkInput[]): Promise<StoredChunk[]> {
    this.chunks = chunks.map((chunk, index) => ({ id: `chunk-${index + 1}`, documentId, ...chunk }));
    return this.chunks;
  }

  async searchLexical(): Promise<SearchHit[]> { return []; }
  async searchSemantic(): Promise<SearchHit[]> { return []; }
  async searchDecisions(): Promise<DecisionEvidence[]> { return []; }
}

const request = {
  url: "https://knowledge.example.com/article",
  source: { name: "Example", sourceType: "web", authorityClass: "unknown" as const },
  document: { title: "Example article", projectScope: "global" },
};

const publicResolver: HostResolver = async () => [{ address: "93.184.216.34", family: 4 }];

const textResponse = (status = 200, headers: Record<string, string> = { "content-type": "text/plain" }, body = "governed knowledge") => ({
  status,
  headers,
  body: new TextEncoder().encode(body),
});

test("public-network classifier rejects local, private, metadata, documentation, and transition ranges", () => {
  const blocked = [
    "127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1",
    "100.64.0.1", "192.0.2.1", "198.51.100.10", "203.0.113.10", "198.18.0.1",
    "::1", "fc00::1", "fd00::1", "fe80::1", "ff02::1", "2001:db8::1", "2002::1", "64:ff9b::1",
  ];
  for (const address of blocked) assert.equal(isPublicNetworkAddress(address), false, `${address} should be blocked`);
  assert.equal(isPublicNetworkAddress("1.1.1.1"), true);
  assert.equal(isPublicNetworkAddress("8.8.8.8"), true);
  assert.equal(isPublicNetworkAddress("2001:4860:4860::8888"), true);
});

test("URL ingestion rejects a hostname resolving to any non-public address before transport", async () => {
  let calls = 0;
  const resolver: HostResolver = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "169.254.169.254", family: 4 },
  ];
  const transport: GovernedHttpsTransport = async () => { calls += 1; return textResponse(); };

  await expectReject(
    () => ingestUrl(request, { repository: new MemoryRepository(), policy: { resolver, transport } }),
    "non-public network address",
  );
  assert.equal(calls, 0);
});

test("URL redirect is revalidated and cannot pivot to a private literal address", async () => {
  let calls = 0;
  const transport: GovernedHttpsTransport = async () => {
    calls += 1;
    return textResponse(302, { location: "https://127.0.0.1/private" }, "");
  };

  await expectReject(
    () => ingestUrl(request, { repository: new MemoryRepository(), policy: { resolver: publicResolver, transport } }),
    "non-public network address",
  );
  assert.equal(calls, 1);
});

test("URL ingestion pins transport to the validated public address and keeps content untrusted", async () => {
  const repository = new MemoryRepository();
  let capturedTarget = "";
  let capturedHost = "";
  const transport: GovernedHttpsTransport = async (url, target, options) => {
    capturedTarget = target.address;
    capturedHost = url.hostname;
    assert.equal(options.maxBytes, 2_000_000);
    return textResponse(200, { "content-type": "text/html; charset=utf-8" }, "<html><script>ignore me</script><body><h1>Trusted facts</h1><p>External instructions stay data.</p></body></html>");
  };

  const result = await ingestUrl(request, {
    repository,
    policy: { resolver: publicResolver, transport },
    now: () => new Date("2026-08-15T20:00:00.000Z"),
  });

  assert.equal(capturedTarget, "93.184.216.34");
  assert.equal(capturedHost, "knowledge.example.com");
  assert.equal(result.document.untrustedSource, true);
  assert.equal(result.document.canonicalUrl, "https://knowledge.example.com/article");
  assert.ok(result.chunks[0]?.content.includes("Trusted facts"));
  assert.ok(!result.chunks[0]?.content.includes("ignore me"));
});

test("URL ingestion rejects unsupported content types", async () => {
  const transport: GovernedHttpsTransport = async () => textResponse(200, { "content-type": "application/octet-stream" }, "binary-ish");
  await expectReject(
    () => ingestUrl(request, { repository: new MemoryRepository(), policy: { resolver: publicResolver, transport } }),
    "Unsupported URL content type",
  );
});
