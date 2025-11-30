/**
 * State machine creation and management
 */

import type {
  EventObject,
  Machine,
  MachineConfig,
  MachineImplementations,
  StateNodeConfig,
} from './types.ts';

/**
 * Validate a state node configuration
 */
function validateStateNode<TContext, TEvent extends EventObject>(
  stateNode: StateNodeConfig<TContext, TEvent>,
  stateName: string,
  path: string[] = []
): void {
  const fullPath = [...path, stateName].join('.');

  // If it has child states, it must have an initial state (unless it's parallel)
  if (stateNode.states && Object.keys(stateNode.states).length > 0) {
    if (stateNode.type === 'parallel') {
      // Parallel states don't need an initial state
      // Validate all child states
      for (const [childName, childNode] of Object.entries(stateNode.states)) {
        validateStateNode(childNode, childName, [...path, stateName]);
      }
    } else {
      // Compound state must have initial
      if (!stateNode.initial) {
        throw new Error(
          `Compound state "${fullPath}" has child states but no initial state`
        );
      }

      // Check that initial state exists
      if (!stateNode.states[stateNode.initial]) {
        throw new Error(
          `Initial state "${stateNode.initial}" not found in compound state "${fullPath}"`
        );
      }

      // Validate all child states
      for (const [childName, childNode] of Object.entries(stateNode.states)) {
        validateStateNode(childNode, childName, [...path, stateName]);
      }
    }
  }

  // If it has an initial state, it must have child states
  if (stateNode.initial && (!stateNode.states || Object.keys(stateNode.states).length === 0)) {
    throw new Error(
      `State "${fullPath}" has initial state but no child states`
    );
  }
}

/**
 * Register invoke transitions in state config
 */
function registerInvokeTransitions<TContext, TEvent extends EventObject>(
  stateConfig: StateNodeConfig<TContext, TEvent>
): void {
  if (stateConfig.invoke) {
    const invocations = Array.isArray(stateConfig.invoke) ? stateConfig.invoke : [stateConfig.invoke];
    
    for (const invocation of invocations) {
      const invokeId = invocation.id || `invoked-${Math.random().toString(36).slice(2, 9)}`;
      
      // Store the ID back in the invocation for later reference
      if (!invocation.id) {
        invocation.id = invokeId;
      }
      
      // Register onDone transition
      if (invocation.onDone) {
        if (!stateConfig.on) {
          stateConfig.on = {} as any;
        }
        (stateConfig.on as any)[`done.invoke.${invokeId}`] = invocation.onDone;
      }
      
      // Register onError transition
      if (invocation.onError) {
        if (!stateConfig.on) {
          stateConfig.on = {} as any;
        }
        (stateConfig.on as any)[`error.invoke.${invokeId}`] = invocation.onError;
      }
    }
  }
  
  // Recursively process child states
  if (stateConfig.states) {
    for (const childConfig of Object.values(stateConfig.states)) {
      registerInvokeTransitions(childConfig);
    }
  }
}

/**
 * Create a state machine
 * 
 * @example
 * ```ts
 * const machine = createMachine({
 *   id: 'toggle',
 *   initial: 'inactive',
 *   states: {
 *     inactive: {
 *       on: {
 *         TOGGLE: { target: 'active' }
 *       }
 *     },
 *     active: {
 *       on: {
 *         TOGGLE: { target: 'inactive' }
 *       }
 *     }
 *   }
 * });
 * ```
 */
export function createMachine<TContext, TEvent extends EventObject>(
  config: MachineConfig<TContext, TEvent>,
  implementations?: MachineImplementations<TContext, TEvent>
): Machine<TContext, TEvent> {
  // Validate configuration
  if (!config.initial) {
    throw new Error('Machine must have an initial state');
  }

  if (!config.states || Object.keys(config.states).length === 0) {
    throw new Error('Machine must have at least one state');
  }

  if (!config.states[config.initial]) {
    throw new Error(`Initial state "${config.initial}" not found in states`);
  }

  // Validate all state nodes
  for (const [stateName, stateNode] of Object.entries(config.states)) {
    validateStateNode(stateNode, stateName);
  }

  // Register invoke transitions
  for (const stateNode of Object.values(config.states)) {
    registerInvokeTransitions(stateNode);
  }

  const machine: Machine<TContext, TEvent> = {
    config,
    initialState: config.initial,
    implementations,

    provide(
      newImplementations: Partial<MachineImplementations<TContext, TEvent>>
    ): Machine<TContext, TEvent> {
      return createMachine(config, {
        actions: {
          ...implementations?.actions,
          ...newImplementations.actions,
        },
        guards: {
          ...implementations?.guards,
          ...newImplementations.guards,
        },
      });
    },
  };

  return machine;
}
