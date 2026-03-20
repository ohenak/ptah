import type { Component } from '../types.js';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
  /** Returns a new Logger that prefixes every line with [ptah:{component}] {LEVEL}: */
  forComponent(component: Component): Logger;
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
    return new ComponentLogger(component);
  }
}

class ComponentLogger implements Logger {
  constructor(private readonly component: Component) {}

  private emit(level: LogLevel, message: string): void {
    const line = `[ptah:${this.component}] ${level}: ${message}`;
    if (level === 'ERROR' || level === 'WARN') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  info(message: string): void  { this.emit('INFO', message); }
  warn(message: string): void  { this.emit('WARN', message); }
  error(message: string): void { this.emit('ERROR', message); }
  debug(message: string): void { this.emit('DEBUG', message); }

  forComponent(component: Component): Logger {
    return new ComponentLogger(component);
  }
}
