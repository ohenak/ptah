export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class ConsoleLogger implements Logger {
  info(message: string): void {
    console.log(`[ptah] ${message}`);
  }

  warn(message: string): void {
    console.log(`[ptah] WARN: ${message}`);
  }

  error(message: string): void {
    console.error(`[ptah] Error: ${message}`);
  }
}
