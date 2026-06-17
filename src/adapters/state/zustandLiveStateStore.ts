// src/adapters/state/zustandLiveStateStore.ts
// LiveStateStore adapter backed by Zustand's framework-agnostic vanilla store.
// Lives under adapters/** because zustand is a vendor SDK and must not leak
// into domain/application/ports/platform (boundary lint). This is the swappable
// plug behind the LiveStateStore port; callers depend only on the port shape so
// the underlying state library can be replaced without touching them.
//
// The integrator can later wrap the existing session store behind this adapter
// (see src/store/sessionStore.ts) without that store needing to know about the
// port at all.

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LiveStateStore } from '@/ports';

/**
 * Create a generic {@link LiveStateStore} backed by a vanilla Zustand store.
 *
 * The returned object exposes only the port surface (getState/setState/
 * subscribe). Notable shape-matching details vs. the raw Zustand API:
 *
 * - `setState` accepts a partial object or an updater `(state) => partial` and
 *   always performs a merge (never a full replace), matching the port contract.
 * - `subscribe` invokes listeners with the new state only. Zustand passes
 *   `(state, prevState)`; we adapt to the single-argument port signature and
 *   return Zustand's own unsubscribe function.
 *
 * @param initial Initial state value.
 */
export function createZustandLiveStateStore<T extends object>(
  initial: T,
): LiveStateStore<T> {
  const store: StoreApi<T> = createStore<T>(() => ({ ...initial }));

  return {
    getState(): T {
      return store.getState();
    },

    setState(partial: Partial<T> | ((s: T) => Partial<T>)): void {
      // `replace: false` keeps a shallow merge so callers can update a subset
      // of keys, exactly as the port documents.
      store.setState(partial, false);
    },

    subscribe(listener: (s: T) => void): () => void {
      return store.subscribe((state) => {
        listener(state);
      });
    },
  };
}
