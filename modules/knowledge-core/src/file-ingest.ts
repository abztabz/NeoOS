import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { EmbeddingProvider, KnowledgeDocumentInput, KnowledgeRepository, KnowledgeSourceInput } from "./contracts.js";
import { ingestText, type TextIngestionResult } from "./ingest.js";

export type SupportedKnowledgeFile = "pdf" | "docx" | "text" | "markdown";

export interface FileIngestionRequest {
  filename: string;
  declaredMimeType?: string;
  bytes: Uint8Array;
  source: KnowledgeSourceInput;
  document: Omit<KnowledgeDocumentInput, "retrievedAt"> & { retrievedAt?: string };
  chunkSize?: number;
  overlap?: number;
}

export interface FileIngestionPolicy {
  maxFileBytes?: number;
  maxExtractedCharacters?: number;
  maxPdfPages?: number;
  maxDocxEntries?: number;
  maxDocxUncompressedBytes?: number;
}

interface ExtractedFile {
  type: SupportedKnowledgeFile;
  mimeType: string;
  text: string;
  metadata: Record<string, unknown>;
}

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const PDF_SIGNATURE = "%PDF-";

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error("File ingestion policy is invalid");
  }
  return resolved;
}

function extensionOf(filename: string): string {
  const normalized = filename.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index + 1) : "";
}

function startsWithAscii(bytes: Uint8Array, value: string): boolean {
  if (bytes.length < value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2] ?? -1);
}

function normalizeDeclaredMime(value?: string): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function validateDeclaredMime(type: SupportedKnowledgeFile, declaredMimeType?: string): void {
  const declared = normalizeDeclaredMime(declaredMimeType);
  if (!declared) return;
  const allowed: Record<SupportedKnowledgeFile, string[]> = {
    pdf: ["application/pdf"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"],
    text: ["text/plain"],
    markdown: ["text/markdown", "text/plain", "text/x-markdown"],
  };
  if (!allowed[type].includes(declared)) throw new Error("Declared file type does not match detected file type");
}

function detectType(filename: string, declaredMimeType: string | undefined, bytes: Uint8Array): SupportedKnowledgeFile {
  const extension = extensionOf(filename);
  if (startsWithAscii(bytes, PDF_SIGNATURE)) {
    if (extension && extension !== "pdf") throw new Error("File extension does not match PDF content");
    validateDeclaredMime("pdf", declaredMimeType);
    return "pdf";
  }
  if (isZip(bytes)) {
    if (extension !== "docx") throw new Error("ZIP input is accepted only as a DOCX document");
    validateDeclaredMime("docx", declaredMimeType);
    return "docx";
  }
  if (extension === "txt") {
    validateDeclaredMime("text", declaredMimeType);
    return "text";
  }
  if (extension === "md" || extension === "markdown") {
    validateDeclaredMime("markdown", declaredMimeType);
    return "markdown";
  }
  if (extension === "pdf" || extension === "docx") throw new Error("File content does not match its extension");
  throw new Error("Unsupported knowledge file type");
}

function decodeText(bytes: Uint8Array, maxCharacters: number): string {
  if (bytes.some((byte) => byte === 0)) throw new Error("Text file contains binary NUL bytes");
  let text: string;
  try {
    text = UTF8.decode(bytes);
  } catch {
    throw new Error("Text file is not valid UTF-8");
  }
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error("Knowledge file contained no ingestible text");
  if (text.length > maxCharacters) throw new Error("Extracted file text exceeds the character limit");
  return text;
}

function readU16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) throw new Error("DOCX ZIP structure is truncated");
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw new Error("DOCX ZIP structure is truncated");
  return view.getUint32(offset, true);
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

function findEocd(bytes: Uint8Array, view: DataView): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readU32(view, offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  throw new Error("DOCX ZIP end-of-directory record was not found");
}

function parseZipEntries(bytes: Uint8Array, maxEntries: number, maxUncompressedBytes: number): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes, view);
  const disk = readU16(view, eocd + 4);
  const centralDisk = readU16(view, eocd + 6);
  const entriesOnDisk = readU16(view, eocd + 8);
  const totalEntries = readU16(view, eocd + 10);
  const centralSize = readU32(view, eocd + 12);
  const centralOffset = readU32(view, eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) throw new Error("Multi-disk DOCX ZIP files are not supported");
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error("ZIP64 DOCX files are not supported");
  if (totalEntries > maxEntries) throw new Error("DOCX contains too many ZIP entries");
  if (centralOffset + centralSize > bytes.length) throw new Error("DOCX central directory exceeds file bounds");

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let totalUncompressed = 0;
  const names = new Set<string>();
  for (let index = 0; index < totalEntries; index += 1) {
    if (readU32(view, offset) !== ZIP_CENTRAL_SIGNATURE) throw new Error("DOCX central directory is invalid");
    const flags = readU16(view, offset + 8);
    const method = readU16(view, offset + 10);
    const entryCrc = readU32(view, offset + 16);
    const compressedSize = readU32(view, offset + 20);
    const uncompressedSize = readU32(view, offset + 24);
    const nameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localHeaderOffset = readU32(view, offset + 42);
    if ([compressedSize, uncompressedSize, localHeaderOffset].includes(0xffffffff)) throw new Error("ZIP64 DOCX entries are not supported");
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) throw new Error("DOCX ZIP entry name is truncated");
    let name: string;
    try {
      name = UTF8.decode(bytes.subarray(nameStart, nameEnd)).replace(/\\/g, "/");
    } catch {
      throw new Error("DOCX ZIP contains a non-UTF-8 entry name");
    }
    if (!name || name.startsWith("/") || name.includes("../") || names.has(name)) throw new Error("DOCX ZIP contains an unsafe or duplicate entry name");
    names.add(name);
    if ((flags & 0x1) !== 0) throw new Error("Encrypted DOCX ZIP entries are not supported");
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > maxUncompressedBytes) throw new Error("DOCX expanded content exceeds the uncompressed size limit");
    entries.push({ name, flags, method, crc32: entryCrc, compressedSize, uncompressedSize, localHeaderOffset });
    offset = nameEnd + extraLength + commentLength;
    if (offset > centralOffset + centralSize) throw new Error("DOCX central directory entry exceeds declared bounds");
  }
  return entries;
}

function extractZipEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (readU32(view, offset) !== ZIP_LOCAL_SIGNATURE) throw new Error("DOCX local ZIP header is invalid");
  const localFlags = readU16(view, offset + 6);
  const localMethod = readU16(view, offset + 8);
  const nameLength = readU16(view, offset + 26);
  const extraLength = readU16(view, offset + 28);
  if ((localFlags & 0x1) !== 0 || localMethod !== entry.method) throw new Error("DOCX ZIP local header does not match central directory");
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > bytes.length) throw new Error("DOCX compressed entry exceeds file bounds");
  const compressed = bytes.subarray(dataStart, dataEnd);
  let output: Uint8Array;
  if (entry.method === 0) output = new Uint8Array(compressed);
  else if (entry.method === 8) {
    try {
      output = new Uint8Array(inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.uncompressedSize) }));
    } catch {
      throw new Error("DOCX compressed entry could not be safely expanded");
    }
  } else throw new Error("DOCX uses an unsupported ZIP compression method");
  if (output.byteLength !== entry.uncompressedSize) throw new Error("DOCX ZIP entry expanded to an unexpected size");
  if (crc32(output) !== entry.crc32) throw new Error("DOCX ZIP entry failed CRC validation");
  return output;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => {
      const numeric = Number(code);
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const numeric = Number.parseInt(code, 16);
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : " ";
    });
}

function extractDocxText(bytes: Uint8Array, maxCharacters: number, maxEntries: number, maxUncompressedBytes: number): string {
  const entries = parseZipEntries(bytes, maxEntries, maxUncompressedBytes);
  if (entries.some((entry) => entry.name.toLowerCase().endsWith("/vbaproject.bin"))) throw new Error("Macro-enabled DOCX content is not accepted");
  const contentTypes = entries.find((entry) => entry.name === "[Content_Types].xml");
  const documentEntry = entries.find((entry) => entry.name === "word/document.xml");
  if (!contentTypes || !documentEntry) throw new Error("ZIP file is not a valid DOCX document");
  const contentTypesXml = decodeText(extractZipEntry(bytes, contentTypes), Math.min(maxCharacters, 1_000_000));
  if (!contentTypesXml.includes("wordprocessingml.document.main+xml") || /macroenabled/i.test(contentTypesXml)) {
    throw new Error("DOCX content types are not accepted");
  }
  const xml = decodeText(extractZipEntry(bytes, documentEntry), Math.max(maxCharacters * 4, maxCharacters));
  const text = decodeXmlEntities(xml
    .replace(/<w:(?:instrText|delText)\b[^>]*>[\s\S]*?<\/w:(?:instrText|delText)>/gi, " ")
    .replace(/<w:tab\b[^>]*\/>/gi, "\t")
    .replace(/<w:br\b[^>]*\/>/gi, "\n")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!text) throw new Error("DOCX contained no ingestible text");
  if (text.length > maxCharacters) throw new Error("Extracted file text exceeds the character limit");
  return text;
}

async function extractPdfText(bytes: Uint8Array, maxCharacters: number, maxPages: number): Promise<{ text: string; pages: number }> {
  const loadingTask = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    disableAutoFetch: true,
    disableStream: true,
  });
  let document: Awaited<typeof loadingTask.promise> | undefined;
  try {
    document = await loadingTask.promise;
    if (document.numPages > maxPages) throw new Error("PDF exceeds the page limit");
    const parts: string[] = [];
    let characters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (pageText) {
          characters += pageText.length + 1;
          if (characters > maxCharacters) throw new Error("Extracted file text exceeds the character limit");
          parts.push(pageText);
        }
      } finally {
        page.cleanup();
      }
    }
    const text = parts.join("\n").trim();
    if (!text) throw new Error("PDF contained no ingestible text");
    return { text, pages: document.numPages };
  } finally {
    if (document) await document.destroy();
    else await loadingTask.destroy();
  }
}

async function extractFile(request: FileIngestionRequest, policy: FileIngestionPolicy): Promise<ExtractedFile> {
  const maxFileBytes = boundedInteger(policy.maxFileBytes, 10_000_000, 1_024, 25_000_000);
  const maxCharacters = boundedInteger(policy.maxExtractedCharacters, 2_000_000, 1_000, 5_000_000);
  const maxPdfPages = boundedInteger(policy.maxPdfPages, 300, 1, 1_000);
  const maxDocxEntries = boundedInteger(policy.maxDocxEntries, 2_000, 1, 10_000);
  const maxDocxUncompressedBytes = boundedInteger(policy.maxDocxUncompressedBytes, 25_000_000, 1_024, 100_000_000);
  if (!request.filename.trim() || request.filename.length > 500) throw new Error("Knowledge filename is invalid");
  if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength === 0) throw new Error("Knowledge file is empty");
  if (request.bytes.byteLength > maxFileBytes) throw new Error("Knowledge file exceeds the byte limit");

  const type = detectType(request.filename, request.declaredMimeType, request.bytes);
  if (type === "text") return { type, mimeType: "text/plain", text: decodeText(request.bytes, maxCharacters), metadata: {} };
  if (type === "markdown") return { type, mimeType: "text/markdown", text: decodeText(request.bytes, maxCharacters), metadata: {} };
  if (type === "docx") return {
    type,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    text: extractDocxText(request.bytes, maxCharacters, maxDocxEntries, maxDocxUncompressedBytes),
    metadata: {},
  };
  const pdf = await extractPdfText(request.bytes, maxCharacters, maxPdfPages);
  return { type, mimeType: "application/pdf", text: pdf.text, metadata: { pageCount: pdf.pages } };
}

export async function ingestFile(
  request: FileIngestionRequest,
  deps: { repository: KnowledgeRepository; embedder?: EmbeddingProvider; policy?: FileIngestionPolicy; now?: () => Date },
): Promise<TextIngestionResult> {
  const extracted = await extractFile(request, deps.policy ?? {});
  const fileHash = sha256(request.bytes);
  const provenance = {
    filename: request.filename,
    originalFileSha256: fileHash,
    originalByteLength: request.bytes.byteLength,
    detectedFileType: extracted.type,
    ...extracted.metadata,
  };
  return ingestText({
    source: { ...request.source, metadata: { ...request.source.metadata, ...provenance } },
    document: {
      ...request.document,
      mimeType: extracted.mimeType,
      metadata: { ...request.document.metadata, ...provenance },
    },
    content: extracted.text,
    chunkSize: request.chunkSize,
    overlap: request.overlap,
  }, { repository: deps.repository, embedder: deps.embedder, now: deps.now });
}
