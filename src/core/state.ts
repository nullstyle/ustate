/**
 * State snapshot implementation
 */

import type { EventObject, StateSnapshot, StateValue } from './types.ts';
import { matchesStateValue } from './stateValue.ts';

/**
 * Create a state snapshot
 */
export function createStateSnapshot<TContext>(
  value: StateValue,
  context: TContext,
  canHandle: (event: EventObject) => boolean
): StateSnapshot<TContext> {
  return {
    value,
    context,
    
    matches(stateValue: StateValue | string): boolean {
      return matchesStateValue(value, stateValue);
    },
    
    can(event: EventObject): boolean {
      return canHandle(event);
    },
  };
}
