/**
 * Compatibility layer for XState migration
 */

import { createMachine as createMachineCore } from './core/machine.ts';
import type { EventObject, Machine, MachineConfig, MachineImplementations } from './core/types.ts';

/**
 * Check if a machine config uses unsupported features
 */
function checkUnsupportedFeatures<TContext, TEvent extends EventObject>(
  config: MachineConfig<TContext, TEvent>
): string[] {
  const warnings: string[] = [];

  // Check for history states (not supported)
  function checkForHistoryStates(states: Record<string, any>, path: string = ''): void {
    for (const [key, state] of Object.entries(states)) {
      const statePath = path ? `${path}.${key}` : key;
      
      if (state.type === 'history') {
        warnings.push(
          `History state detected at "${statePath}". ` +
          `Workaround: Track previous states in context.`
        );
      }

      if (state.states) {
        checkForHistoryStates(state.states, statePath);
      }
    }
  }

  // Check for invoked/spawned actors (not supported)
  function checkForInvokedActors(states: Record<string, any>, path: string = ''): void {
    for (const [key, state] of Object.entries(states)) {
      const statePath = path ? `${path}.${key}` : key;
      
      if (state.invoke) {
        warnings.push(
          `Invoked actor detected at "${statePath}". ` +
          `Workaround: Manage child actors externally.`
        );
      }

      if (state.states) {
        checkForInvokedActors(state.states, statePath);
      }
    }
  }

  // Check for delayed transitions (not supported)
  function checkForDelayedTransitions(states: Record<string, any>, path: string = ''): void {
    for (const [key, state] of Object.entries(states)) {
      const statePath = path ? `${path}.${key}` : key;
      
      if (state.after) {
        warnings.push(
          `Delayed transition (after) detected at "${statePath}". ` +
          `Workaround: Use setTimeout in entry actions.`
        );
      }

      if (state.always) {
        warnings.push(
          `Always transition detected at "${statePath}". ` +
          `Workaround: Use explicit events instead.`
        );
      }

      if (state.states) {
        checkForDelayedTransitions(state.states, statePath);
      }
    }
  }

  if (config.states) {
    checkForHistoryStates(config.states);
    checkForInvokedActors(config.states);
    checkForDelayedTransitions(config.states);
  }

  return warnings;
}

/**
 * Create a machine with compatibility warnings
 */
export function createMachine<TContext, TEvent extends EventObject>(
  config: MachineConfig<TContext, TEvent>,
  implementations?: MachineImplementations<TContext, TEvent>
): Machine<TContext, TEvent> {
  const warnings = checkUnsupportedFeatures(config);
  
  if (warnings.length > 0) {
    console.warn('⚠️  ustate compatibility warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
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
      'Flat state machines',
      'Hierarchical (nested) states',
      'Parallel states',
      'Event-driven transitions',
      'Context management with assign()',
      'Entry and exit actions',
      'Transition actions',
      'Guards (conditional transitions)',
      'setup() function',
      'machine.provide() for implementation overrides',
      'State matching with state.matches()',
      'Event capability checking with state.can()'
    ],
    unsupported: [
      'History states',
      'Invoked actors',
      'Spawned actors',
      'Delayed transitions (after)',
      'Always transitions'
    ]
  };
}
