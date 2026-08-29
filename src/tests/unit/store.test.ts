import { describe, it, expect } from 'vitest';
import { SimulationStore } from '../../core/simulation/store';

describe('SimulationStore', () => {
  it('set menandai dirty; flush memanggil listener sekali', () => {
    const store = new SimulationStore({ a: 1 });
    let calls = 0;
    let last = 0;
    store.subscribe((s) => {
      calls++;
      last = s.a;
    });
    store.set({ a: 2 });
    store.set({ a: 3 });
    store.flush();
    store.flush(); // kedua flush: no-op
    expect(calls).toBe(1);
    expect(last).toBe(3);
  });

  it('isDirty false setelah flush', () => {
    const store = new SimulationStore<{ a: number }>({ a: 0 });
    expect(store.isDirty).toBe(false);
    store.set({ a: 1 });
    expect(store.isDirty).toBe(true);
    store.flush();
    expect(store.isDirty).toBe(false);
  });
});
