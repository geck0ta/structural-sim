// §12 — single source of truth; dirty-flag; flush sekali per frame oleh loop render.

export type Listener<T> = (state: T) => void;

export class SimulationStore<T extends object> {
  private state: T;
  private readonly listeners = new Set<Listener<T>>();
  private dirty = false;

  constructor(initial: T) {
    this.state = initial;
  }

  get = (): T => this.state;

  /** Mutasi state (patch dangkal) — menandai dirty, TIDAK langsung memberi tahu. */
  set = (patch: Partial<T>): void => {
    this.state = { ...this.state, ...patch };
    this.dirty = true;
  };

  subscribe = (fn: Listener<T>): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  get isDirty(): boolean {
    return this.dirty;
  }

  /** Dipanggil loop render: memberi tahu listener maksimal sekali per frame, hanya bila dirty. */
  flush = (): void => {
    if (!this.dirty) return;
    this.dirty = false;
    for (const fn of this.listeners) fn(this.state);
  };
}
