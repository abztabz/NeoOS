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
