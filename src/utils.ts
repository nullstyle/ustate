/**
 * Utilities for testing and interacting with actors
 */

import type { ActorRef, EventObject, StateSnapshot } from "./core/types.ts";

/**
 * Options for waitFor
 */
export interface WaitForOptions {
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Wait for an actor to reach a specific state
 *
 * @example
 * ```ts
 * await waitFor(actor, (state) => state.matches('success'));
 * ```
 */
export function waitFor<TContext, TEvent extends EventObject>(
  actor: ActorRef<TContext, TEvent>,
  predicate: (state: StateSnapshot<TContext>) => boolean,
  options: WaitForOptions = {},
): Promise<StateSnapshot<TContext>> {
  const { timeout = 10000 } = options;

  return new Promise((resolve, reject) => {
    // Check current state first
    const currentState = actor.getSnapshot();
    if (predicate(currentState)) {
      resolve(currentState);
      return;
    }

    // deno-lint-ignore prefer-const
    let subscription: { unsubscribe(): void } | undefined;
    // deno-lint-ignore prefer-const
    let timer: number;

    const cleanup = () => {
      if (subscription) {
        subscription.unsubscribe();
      }
      if (timer) {
        clearTimeout(timer);
      }
    };

    // Set timeout
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitFor: timeout of ${timeout}ms exceeded`));
    }, timeout);

    // Subscribe to state changes
    subscription = actor.subscribe((state) => {
      try {
        if (predicate(state)) {
          cleanup();
          resolve(state);
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  });
}
