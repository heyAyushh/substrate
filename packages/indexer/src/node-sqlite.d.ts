declare module "node:sqlite" {
  export interface StatementSync {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
