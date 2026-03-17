import type { Component } from "../types.js";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
  forComponent(component: Component): Logger;
}

/**
 * ComponentLogger delegates writes to a root ConsoleLogger, prefixing
 * each message with `[ptah:{component}] {LEVEL}: `. Used internally
 * by ConsoleLogger.forComponent().
 */
export class ComponentLogger implements Logger {
  constructor(
    private readonly component: Component,
    private readonly root: ConsoleLogger,
  ) {}

  info(message: string): void {
    this.root.info(`[ptah:${this.component}] INFO: ${message}`);
  }

  warn(message: string): void {
    this.root.warn(`[ptah:${this.component}] WARN: ${message}`);
  }

  error(message: string): void {
    this.root.error(`[ptah:${this.component}] ERROR: ${message}`);
  }

  debug(message: string): void {
    this.root.debug(`[ptah:${this.component}] DEBUG: ${message}`);
  }

  forComponent(component: Component): Logger {
    return new ComponentLogger(component, this.root);
  }
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

  debug(message: string): void {
    console.debug(`[ptah] DEBUG: ${message}`);
  }

  forComponent(component: Component): Logger {
    return new ComponentLogger(component, this);
  }
}
