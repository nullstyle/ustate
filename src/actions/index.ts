/**
 * Action utilities
 */

export { assign } from "./assign.ts";
export type { Assigner } from "./assign.ts";

import type { ActionFunction, EventObject } from "../core/types.ts";

/**
 * Create a log action
 *
 * @example
 * ```ts
 * log('Hello world')
 * log(({ context }) => `Count: ${context.count}`)
 * ```
 */
export function log<TContext, TEvent extends EventObject>(
  message: string | ((args: { context: TContext; event: TEvent }) => string),
): ActionFunction<TContext, TEvent> {
  return (args) => {
    const msg = typeof message === "function" ? message(args) : message;
    console.log(msg);
  };
}

/**
 * Create a raise action to send an event to self
 * Note: This is a simplified version that doesn't actually raise events
 * in the current implementation. For full compatibility, this would need
 * to be integrated with the actor's event queue.
 *
 * @example
 * ```ts
 * raise({ type: 'NEXT' })
 * ```
 */
export function raise<TContext, TEvent extends EventObject>(
  event: TEvent | ((args: { context: TContext; event: TEvent }) => TEvent),
): ActionFunction<TContext, TEvent> {
  return (args) => {
    const eventToRaise = typeof event === "function" ? event(args) : event;
    console.warn("raise() is not fully implemented yet. Event:", eventToRaise);
    // TODO: Implement event queue and raise mechanism
  };
}
