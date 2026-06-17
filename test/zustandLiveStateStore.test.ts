import { describe, it, expect, vi } from 'vitest';
import { createZustandLiveStateStore } from '@/adapters/state/zustandLiveStateStore';

interface SessionLike {
  count: number;
  sport: string;
  recording: boolean;
}

const initial: SessionLike = { count: 0, sport: 'tennis', recording: false };

describe('createZustandLiveStateStore', () => {
  it('exposes the initial state via getState', () => {
    const store = createZustandLiveStateStore<SessionLike>(initial);
    expect(store.getState()).toEqual(initial);
  });

  it('does not mutate the caller-provided initial object', () => {
    const store = createZustandLiveStateStore<SessionLike>(initial);
    store.setState({ count: 5 });
    expect(initial.count).toBe(0);
    expect(store.getState().count).toBe(5);
  });

  it('setState with a partial object merges into state', () => {
    const store = createZustandLiveStateStore<SessionLike>(initial);
    store.setState({ count: 3 });
    expect(store.getState()).toEqual({ count: 3, sport: 'tennis', recording: false });
  });

  it('setState with an updater function receives current state and merges', () => {
    const store = createZustandLiveStateStore<SessionLike>(initial);
    store.setState({ count: 10 });
    store.setState((s) => ({ count: s.count + 1, recording: true }));
    expect(store.getState()).toEqual({ count: 11, sport: 'tennis', recording: true });
  });

  it('subscribe fires listeners with the new state on change', () => {
    const store = createZustandLiveStateStore<SessionLike>(initial);
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState({ count: 1 });
    store.setState({ sport: 'golf' });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({ count: 1 }));
    expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({ sport: 'golf' }));
  });

  it('unsubscribe stops further notifications', () => {
    const store = createZustandLiveStateStore<SessionLike>(initial);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setState({ count: 1 });
    unsubscribe();
    store.setState({ count: 2 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().count).toBe(2);
  });

  it('supports multiple independent subscribers', () => {
    const store = createZustandLiveStateStore<SessionLike>(initial);
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    const unsubB = store.subscribe(b);

    store.setState({ count: 1 });
    unsubB();
    store.setState({ count: 2 });

    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
