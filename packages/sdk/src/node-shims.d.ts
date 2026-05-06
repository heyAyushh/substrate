declare module "node:crypto" {
  export interface Hash {
    update(data: string | Uint8Array): Hash;
    digest(): Buffer;
    digest(encoding: "hex"): string;
  }

  export function createHash(algorithm: string): Hash;
}

declare module "node:test" {
  export interface TestContext {
    test(
      name: string,
      fn: (context: TestContext) => void | Promise<void>,
    ): void;
  }

  export default function test(
    name: string,
    fn: (context: TestContext) => void | Promise<void>,
  ): void;
}

declare module "node:assert/strict" {
  export function strictEqual(
    actual: unknown,
    expected: unknown,
    message?: string,
  ): void;
  export function deepStrictEqual(
    actual: unknown,
    expected: unknown,
    message?: string,
  ): void;
  export function ok(value: unknown, message?: string): void;
  export function throws(
    block: () => unknown,
    expected?: RegExp | ((error: unknown) => boolean),
    message?: string,
  ): void;
  export function doesNotThrow(block: () => unknown, message?: string): void;
}
