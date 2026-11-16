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
import { ingestFile } from "../src/file-ingest.js";

const encoder = new TextEncoder();

async function expectReject(fn: () => Promise<unknown>, expected: string): Promise<void> {
  let caught: unknown;
  try { await fn(); } catch (error) { caught = error; }
  assert.ok(caught instanceof Error, "Expected an Error rejection");
  assert.ok(caught.message.includes(expected), `Expected error containing: ${expected}`);
}

class MemoryRepository implements KnowledgeRepository {
  source: StoredSource = { id: "source-1", name: "File", sourceType: "file", authorityClass: "unknown" };
  document?: StoredDocument;
  chunks: StoredChunk[] = [];
  async upsertSource(source: KnowledgeSourceInput): Promise<StoredSource> { this.source = { id: "source-1", ...source }; return this.source; }
  async insertDocument(input: KnowledgeDocumentInput & { sourceId: string; contentHash: string; untrustedSource: boolean }): Promise<StoredDocument> {
    this.document = { id: "doc-1", ...input }; return this.document;
  }
  async insertChunks(documentId: string, chunks: ChunkInput[]): Promise<StoredChunk[]> {
    this.chunks = chunks.map((chunk, index) => ({ id: `chunk-${index + 1}`, documentId, ...chunk })); return this.chunks;
  }
  async searchLexical(): Promise<SearchHit[]> { return []; }
  async searchSemantic(): Promise<SearchHit[]> { return []; }
  async searchDecisions(): Promise<DecisionEvidence[]> { return []; }
}

const base = {
  source: { name: "Uploaded file", sourceType: "file", authorityClass: "unknown" as const },
  document: { title: "Uploaded file", projectScope: "NeoContent" },
};

const le16 = (value: number) => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
const le32 = (value: number) => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

let crcTable: Uint32Array | undefined;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let value = 0xffffffff;
  for (const byte of bytes) value = (crcTable[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function makeStoredZip(entries: Array<{ name: string; content: string | Uint8Array }>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = typeof entry.content === "string" ? encoder.encode(entry.content) : entry.content;
    const crc = crc32(data);
    const local = concat([
      le32(0x04034b50), le16(20), le16(0), le16(0), le16(0), le16(0),
      le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0), name, data,
    ]);
    locals.push(local);
    const central = concat([
      le32(0x02014b50), le16(20), le16(20), le16(0), le16(0), le16(0), le16(0),
      le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0), le16(0),
      le16(0), le16(0), le32(0), le32(localOffset), name,
    ]);
    centrals.push(central);
    localOffset += local.length;
  }
  const localData = concat(locals);
  const centralData = concat(centrals);
  const eocd = concat([
    le32(0x06054b50), le16(0), le16(0), le16(entries.length), le16(entries.length),
    le32(centralData.length), le32(localData.length), le16(0),
  ]);
  return concat([localData, centralData, eocd]);
}

function makeDocx(text: string, includeMacro = false): Uint8Array {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
  const entries: Array<{ name: string; content: string | Uint8Array }> = [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "word/document.xml", content: documentXml },
  ];
  if (includeMacro) entries.push({ name: "word/vbaProject.bin", content: Uint8Array.of(1, 2, 3) });
  return makeStoredZip(entries);
}

function makePdf(text: string): Uint8Array {
  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Length ${encoder.encode(`BT /F1 12 Tf 72 720 Td (${text}) Tj ET`).length} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(encoder.encode(body).length);
    body += object;
  }
  const xrefOffset = encoder.encode(body).length;
  body += `xref\n0 6\n0000000000 65535 f \n`;
  for (let index = 1; index <= 5; index += 1) body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(body);
}

test("Markdown ingestion preserves original file hash provenance and remains untrusted", async () => {
  const repository = new MemoryRepository();
  const result = await ingestFile({ ...base, filename: "notes.md", declaredMimeType: "text/markdown", bytes: encoder.encode("# NeoOS\nGoverned knowledge") }, { repository });
  assert.equal(result.document.mimeType, "text/markdown");
  assert.equal(result.document.untrustedSource, true);
  assert.equal(result.document.metadata?.detectedFileType, "markdown");
  assert.equal(String(result.document.metadata?.originalFileSha256).length, 64);
  assert.ok(result.chunks[0]?.content.includes("Governed knowledge"));
});

test("Text ingestion rejects binary NUL bytes and extension/content mismatches", async () => {
  await expectReject(() => ingestFile({ ...base, filename: "bad.txt", bytes: Uint8Array.of(65, 0, 66) }, { repository: new MemoryRepository() }), "binary NUL");
  await expectReject(() => ingestFile({ ...base, filename: "fake.txt", bytes: encoder.encode("%PDF-1.4\n") }, { repository: new MemoryRepository() }), "extension does not match PDF");
});

test("DOCX ingestion validates ZIP structure and extracts visible Word text", async () => {
  const repository = new MemoryRepository();
  const result = await ingestFile({
    ...base,
    filename: "knowledge.docx",
    declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: makeDocx("NeoOS DOCX knowledge"),
  }, { repository });
  assert.equal(result.document.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.ok(result.chunks[0]?.content.includes("NeoOS DOCX knowledge"));
});

test("DOCX ingestion rejects macro payloads", async () => {
  await expectReject(() => ingestFile({ ...base, filename: "macro.docx", bytes: makeDocx("Visible text", true) }, { repository: new MemoryRepository() }), "Macro-enabled");
});

test("PDF ingestion uses PDF.js and extracts text under page/character limits", async () => {
  const repository = new MemoryRepository();
  const result = await ingestFile({ ...base, filename: "knowledge.pdf", declaredMimeType: "application/pdf", bytes: makePdf("Hello NeoOS") }, { repository, policy: { maxPdfPages: 5 } });
  assert.equal(result.document.mimeType, "application/pdf");
  assert.equal(result.document.metadata?.pageCount, 1);
  assert.ok(result.chunks[0]?.content.includes("Hello NeoOS"));
});
