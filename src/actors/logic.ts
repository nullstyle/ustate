/**
 * Actor logic helper functions
 */

import type { CallbackLogic, PromiseLogic } from '../core/types.ts';

/**
 * Create a promise-based actor logic
 */
export function fromPromise<TInput = any, TOutput = any>(
  promiseFn: (input: TInput) => Promise<TOutput>
): PromiseLogic<TInput, TOutput> {
  return {
    __type: 'promise',
    logic: promiseFn
  };
}

/**
 * Create a callback-based actor logic
 */
export function fromCallback<TEvent extends { type: string } = { type: string }>(
  callbackFn: (params: {
    sendBack: (event: TEvent) => void;
    receive: (listener: (event: TEvent) => void) => void;
    input: any;
  }) => (() => void) | void
): CallbackLogic<TEvent> {
  return {
    __type: 'callback',
    logic: callbackFn
  };
}
