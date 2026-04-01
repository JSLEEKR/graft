import * as fs from 'node:fs';
import { BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD } from '../constants.js';

export interface TokenLogEntry {
  nodeName: string;
  estimated: number;
  actual: number | undefined;
  cumulative: number;
  timestamp: string;
}

export class TokenTracker {
  private budget: number;
  private consumed: number = 0;
  private entries: TokenLogEntry[] = [];
  private logPath: string | null;

  constructor(budget: number, logPath: string | null = null) {
    this.budget = budget;
    this.logPath = logPath;
  }

  record(
    nodeName: string,
    usage: { inputTokens: number; outputTokens: number } | undefined,
    estimated: { in: number; out: number },
  ): void {
    const actual = usage ? usage.inputTokens + usage.outputTokens : undefined;
    const est = estimated.in + estimated.out;
    this.consumed += actual ?? est;
    const timestamp = new Date().toISOString();
    const entry: TokenLogEntry = { nodeName, estimated: est, actual, cumulative: this.consumed, timestamp };
    this.entries.push(entry);

    if (this.logPath) {
      const actualStr = actual !== undefined ? String(actual) : 'N/A';
      const pct = this.budget > 0 ? Math.round((this.consumed / this.budget) * 100) : 0;
      const line = `[${timestamp}] Node ${nodeName} | estimated: ${est} | actual: ${actualStr} | cumulative: ${this.consumed}/${this.budget} (${pct}%)\n`;
      try { fs.appendFileSync(this.logPath, line); } catch { /* silent */ }
    }
  }

  get fraction(): number {
    return this.budget > 0 ? this.consumed / this.budget : 0;
  }

  get isWarning(): boolean {
    return this.fraction >= BUDGET_WARNING_THRESHOLD;
  }

  get isCritical(): boolean {
    return this.fraction >= BUDGET_CRITICAL_THRESHOLD;
  }

  get totalConsumed(): number {
    return this.consumed;
  }

  getEntries(): TokenLogEntry[] {
    return [...this.entries];
  }

  getSummary(): {
    budget: number; consumed: number; fraction: number;
    perNode: Array<{ node: string; actual?: number; estimated: number }>;
  } {
    return {
      budget: this.budget,
      consumed: this.consumed,
      fraction: this.fraction,
      perNode: this.entries.map(e => ({
        node: e.nodeName,
        actual: e.actual,
        estimated: e.estimated,
      })),
    };
  }
}
