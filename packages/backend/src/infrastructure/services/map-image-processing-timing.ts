export interface ProcessingTimingMetadata {
  totalMs: number;
  openaiMs?: number;
  resizeMs?: number;
  aiWarpMs?: number;
  pythonStartupMs?: number;
  cv2ImportMs?: number;
  warpStageMs?: number;
  outputMs?: number;
  localProcessorMs?: number;
  localTimeoutMs?: number;
  pythonMs?: number;
  sharpMs?: number;
  thumbnailMs?: number;
  saveMs?: number;
}

export class ProcessingTimer {
  private readonly startedAt = Date.now();
  private readonly marks = new Map<string, number>();

  mark(label: string): void {
    this.marks.set(label, Date.now() - this.startedAt);
  }

  durationSince(label: string): number | undefined {
    const value = this.marks.get(label);
    if (value === undefined) return undefined;
    const end = this.marks.get(`${label}:end`);
    return end !== undefined ? end - value : Date.now() - this.startedAt - value;
  }

  markEnd(label: string): void {
    this.marks.set(`${label}:end`, Date.now() - this.startedAt);
  }

  elapsed(label: string): number | undefined {
    const start = this.marks.get(label);
    const end = this.marks.get(`${label}:end`);
    if (start === undefined || end === undefined) return undefined;
    return end - start;
  }

  totalMs(): number {
    return Date.now() - this.startedAt;
  }

  snapshot(partial: Partial<ProcessingTimingMetadata> = {}): ProcessingTimingMetadata {
    return {
      totalMs: this.totalMs(),
      ...partial,
    };
  }
}
