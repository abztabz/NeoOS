declare const process: {
  env: Record<string, string | undefined>;
};

declare module "node:crypto" {
  interface Hash {
    update(data: string, inputEncoding?: string): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

declare module "node:dns/promises" {
  export function lookup(
    hostname: string,
    options: { all: true; order?: "verbatim" | "ipv4first" | "ipv6first" },
  ): Promise<Array<{ address: string; family: number }>>;
}

declare module "node:net" {
  export function isIP(input: string): 0 | 4 | 6;
}

declare module "node:https" {
  type LookupCallback = (error: Error | null, address: string, family: 4 | 6) => void;
  interface RequestOptions {
    protocol?: string;
    hostname?: string;
    port?: number;
    path?: string;
    method?: string;
    servername?: string;
    rejectUnauthorized?: boolean;
    signal?: AbortSignal;
    lookup?: (hostname: string, options: unknown, callback: LookupCallback) => void;
    headers?: Record<string, string>;
  }
  interface IncomingMessage {
    statusCode?: number;
    headers: Record<string, string | string[] | undefined>;
    resume(): void;
    destroy(error?: Error): void;
    on(event: "data", listener: (chunk: Uint8Array) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }
  interface ClientRequest {
    on(event: "error", listener: (error: Error) => void): this;
    end(): void;
  }
  export function request(options: RequestOptions, callback: (response: IncomingMessage) => void): ClientRequest;
}

declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
  };
  export default assert;
}

declare module "node:test" {
  type TestFn = () => void | Promise<void>;
  const test: (name: string, fn: TestFn) => void;
  export default test;
}

declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
}
