declare module "node:test" {
  export interface TestContext {
    test(
      name: string,
      fn: (context: TestContext) => void | Promise<void>
    ): void;
  }

  export default function test(
    name: string,
    fn: (context: TestContext) => void | Promise<void>
  ): void;
}

declare module "node:assert/strict" {
  export function strictEqual(
    actual: unknown,
    expected: unknown,
    message?: string
  ): void;
  export function deepStrictEqual(
    actual: unknown,
    expected: unknown,
    message?: string
  ): void;
  export function ok(value: unknown, message?: string): void;
  export function throws(
    block: () => unknown,
    expected?: RegExp | ((error: unknown) => boolean),
    message?: string
  ): void;
}
