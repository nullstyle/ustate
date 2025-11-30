/**
 * Setup function for configuring machine implementations
 */

import type {
  EventObject,
  Machine,
  MachineConfig,
  SetupConfig,
  SetupReturn,
} from "./core/types.ts";
import { createMachine } from "./core/machine.ts";

/**
 * Setup a machine with type-safe implementations
 *
 * @example
 * ```ts
 * const machineSetup = setup({
 *   types: {
 *     context: {} as { count: number },
 *     events: {} as { type: 'INC' } | { type: 'DEC' }
 *   },
 *   actions: {
 *     logCount: ({ context }) => console.log(context.count)
 *   },
 *   guards: {
 *     isPositive: ({ context }) => context.count > 0
 *   }
 * });
 *
 * const machine = machineSetup.createMachine({
 *   initial: 'active',
 *   context: { count: 0 },
 *   states: {
 *     active: {
 *       entry: { type: 'logCount' },
 *       on: {
 *         INC: {
 *           actions: assign({ count: ({ context }) => context.count + 1 })
 *         }
 *       }
 *     }
 *   }
 * });
 * ```
 */
export function setup<TContext, TEvent extends EventObject>(
  config?: SetupConfig<TContext, TEvent>,
): SetupReturn<TContext, TEvent> {
  return {
    createMachine(
      machineConfig: MachineConfig<TContext, TEvent>,
    ): Machine<TContext, TEvent> {
      return createMachine(machineConfig, {
        actions: config?.actions,
        guards: config?.guards,
      });
    },
  };
}
