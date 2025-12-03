/**
 * Compatibility layer for XState migration
 */

import { createMachine as createMachineCore } from "./core/machine.ts";
import type {
  EventObject,
  Machine,
  MachineConfig,
  MachineImplementations,
} from "./core/types.ts";

/**
 * Check if a machine config uses unsupported features
 */
function checkUnsupportedFeatures<TContext, TEvent extends EventObject>(
  config: MachineConfig<TContext, TEvent>,
): string[] {
  const warnings: string[] = [];

  // Check for string actor sources (not supported)
  function checkActorSources(
    // deno-lint-ignore no-explicit-any
    states: Record<string, any>,
    path: string = "",
  ): void {
    for (const [key, state] of Object.entries(states)) {
      const statePath = path ? `${path}.${key}` : key;

      if (state.invoke) {
        const invocations = Array.isArray(state.invoke)
          ? state.invoke
          : [state.invoke];
        for (const invocation of invocations) {
          if (typeof invocation.src === "string") {
            warnings.push(
              `String actor source "${invocation.src}" detected at "${statePath}". ` +
                `Workaround: Import the actor logic directly.`,
            );
          }
        }
      }

      if (state.states) {
        checkActorSources(state.states, statePath);
      }
    }
  }

  // Check for final states (not supported)
  function checkFinalStates(
    // deno-lint-ignore no-explicit-any
    states: Record<string, any>,
    path: string = "",
  ): void {
    for (const [key, state] of Object.entries(states)) {
      const statePath = path ? `${path}.${key}` : key;

      if (state.type === "final") {
        warnings.push(
          `Final state detected at "${statePath}". ` +
            `Workaround: Use a normal state with no transitions.`,
        );
      }

      if (state.states) {
        checkFinalStates(state.states, statePath);
      }
    }
  }

  if (config.states) {
    checkActorSources(config.states);
    checkFinalStates(config.states);
  }

  return warnings;
}

/**
 * Create a machine with compatibility warnings
 */
export function createMachine<TContext, TEvent extends EventObject>(
  config: MachineConfig<TContext, TEvent>,
  implementations?: MachineImplementations<TContext, TEvent>,
): Machine<TContext, TEvent> {
  const warnings = checkUnsupportedFeatures(config);

  if (warnings.length > 0) {
    console.warn("⚠️  ustate compatibility warnings:");
    warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  return createMachineCore(config, implementations);
}

/**
 * Get compatibility information
 */
export function getCompatibilityInfo(): {
  supported: string[];
  unsupported: string[];
} {
  return {
    supported: [
      "Flat state machines",
      "Hierarchical (nested) states",
      "Parallel states",
      "Event-driven transitions",
      "Context management with assign()",
      "Entry and exit actions",
      "Transition actions",
      "Guards (conditional transitions)",
      "setup() function",
      "machine.provide() for implementation overrides",
      "State matching with state.matches()",
      "Event capability checking with state.can()",
    ],
    unsupported: [
      'String actor sources (e.g. src: "myService")',
      'Final states (type: "final")',
      "SCXML-specific features (datamodel, etc.)",
    ],
  };
}
