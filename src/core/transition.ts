/**
 * Transition logic for state machines with hierarchical and parallel state support
 */

import type {
  ActionContext,
  ActionDefinition,
  ActionFunction,
  ActorLogic,
  EventObject,
  GuardDefinition,
  GuardFunction,
  Machine,
  MachineImplementations,
  StateNodeConfig,
  StateValue,
  TransitionConfig,
  TransitionDefinition,
} from "./types.ts";
import {
  getHistoryValue,
  mergeStateValues,
  pathToStateValue,
  stateValueToPaths,
} from "./stateValue.ts";

/**
 * Resolve an action definition to an executable function
 */
export function resolveAction<TContext, TEvent extends EventObject>(
  action: ActionDefinition<TContext, TEvent>,
  implementations?: MachineImplementations<TContext, TEvent>,
): ActionFunction<TContext, TEvent> | null {
  if (typeof action === "function") {
    return action;
  }

  if (typeof action === "object" && action.type) {
    const impl = implementations?.actions?.[action.type];
    if (impl) {
      return impl;
    }
    console.warn(`Action "${action.type}" not found in implementations`);
    return null;
  }

  return null;
}

/**
 * Resolve a delay definition to a number (milliseconds)
 */
export function resolveDelay<TContext, TEvent extends EventObject>(
  delay: string | number,
  context: ActionContext<TContext, TEvent>,
  implementations?: MachineImplementations<TContext, TEvent>,
): number {
  if (typeof delay === "number") {
    return delay;
  }

  const impl = implementations?.delays?.[delay];
  if (impl) {
    return typeof impl === "function" ? impl(context) : impl;
  }

  // Try parsing string as number
  const parsed = parseFloat(delay);
  if (!isNaN(parsed)) {
    return parsed;
  }

  console.warn(`Delay "${delay}" not found in implementations`);
  return 0;
}

/**
 * Resolve a guard definition to an executable function
 */
export function resolveGuard<TContext, TEvent extends EventObject>(
  guard: GuardDefinition<TContext, TEvent>,
  implementations?: MachineImplementations<TContext, TEvent>,
): GuardFunction<TContext, TEvent> | null {
  if (typeof guard === "function") {
    return guard;
  }

  if (typeof guard === "object" && guard.type) {
    const impl = implementations?.guards?.[guard.type];
    if (impl) {
      return impl;
    }
    console.warn(`Guard "${guard.type}" not found in implementations`);
    return null;
  }

  return null;
}

/**
 * Execute actions
 */
export function executeActions<TContext, TEvent extends EventObject>(
  actions: ActionDefinition<TContext, TEvent> | ActionDefinition<
    TContext,
    TEvent
  >[] | undefined,
  context: ActionContext<TContext, TEvent>,
  implementations?: MachineImplementations<TContext, TEvent>,
): unknown[] {
  if (!actions) return [];

  const results: unknown[] = [];
  const actionList = Array.isArray(actions) ? actions : [actions];

  for (const action of actionList) {
    const actionFn = resolveAction(action, implementations);
    if (actionFn) {
      // deno-lint-ignore no-explicit-any
      const result = (actionFn as any)(context);
      if (result !== undefined) {
        results.push(result);
      }
    }
  }
  return results;
}

/**
 * Evaluate a guard condition
 */
export function evaluateGuard<TContext, TEvent extends EventObject>(
  guard: GuardDefinition<TContext, TEvent> | undefined,
  context: ActionContext<TContext, TEvent>,
  implementations?: MachineImplementations<TContext, TEvent>,
): boolean {
  if (!guard) return true;

  const guardFn = resolveGuard(guard, implementations);
  if (!guardFn) return true;

  return guardFn(context);
}

/**
 * Get a state node by path
 */
export function getStateNodeByPath<TContext, TEvent extends EventObject>(
  machine: Machine<TContext, TEvent>,
  path: string[],
): StateNodeConfig<TContext, TEvent> | null {
  if (path.length === 0) return null;

  let current = machine.config.states[path[0]];
  if (!current) return null;

  for (let i = 1; i < path.length; i++) {
    if (!current.states || !current.states[path[i]]) {
      return null;
    }
    current = current.states[path[i]];
  }

  return current;
}

/**
 * Get all state nodes in a path (from root to leaf)
 */
export function getStateNodesInPath<TContext, TEvent extends EventObject>(
  machine: Machine<TContext, TEvent>,
  path: string[],
): StateNodeConfig<TContext, TEvent>[] {
  const nodes: StateNodeConfig<TContext, TEvent>[] = [];

  if (path.length === 0) return nodes;

  let current = machine.config.states[path[0]];
  if (!current) return nodes;
  nodes.push(current);

  for (let i = 1; i < path.length; i++) {
    if (!current.states || !current.states[path[i]]) {
      break;
    }
    current = current.states[path[i]];
    nodes.push(current);
  }

  return nodes;
}

/**
 * Find a valid transition for an event in a state path
 */
export function findTransitionInPath<TContext, TEvent extends EventObject>(
  machine: Machine<TContext, TEvent>,
  path: string[],
  event: TEvent,
  context: TContext,
  implementations?: MachineImplementations<TContext, TEvent>,
  spawn?: (
    logic: ActorLogic<unknown, unknown, EventObject>,
    options?: { id?: string; input?: unknown },
  ) => unknown,
):
  | { transition: TransitionConfig<TContext, TEvent>; fromPath: string[] }
  | null {
  // Try from most specific (leaf) to least specific (root)
  for (let i = path.length; i > 0; i--) {
    const currentPath = path.slice(0, i);
    const stateNode = getStateNodeByPath(machine, currentPath);

    // Handle always transitions
    if (stateNode?.always) {
      const transition = findValidTransition(
        stateNode.always,
        context,
        event,
        spawn,
        implementations,
      );
      if (transition) {
        return { transition, fromPath: currentPath };
      }
    }

    if (stateNode?.on) {
      const definition = stateNode.on[event.type as TEvent["type"]];
      if (definition) {
        const transition = findValidTransition(
          definition,
          context,
          event,
          spawn,
          implementations,
        );
        if (transition) {
          return { transition, fromPath: currentPath };
        }
      }
    }

    // Handle delayed transitions
    if (stateNode?.after && event.type === "$delay") {
      // deno-lint-ignore no-explicit-any
      const delayKey = (event as any).key;
      if (delayKey !== undefined && delayKey in stateNode.after) {
        const definition = stateNode.after[delayKey];
        const transition = findValidTransition(
          definition,
          context,
          event,
          spawn,
          implementations,
        );
        if (transition) {
          return { transition, fromPath: currentPath };
        }
      }
    }
  }

  return null;
}

/**
 * Resolve initial state for a compound state
 */
export function resolveInitialState<TContext, TEvent extends EventObject>(
  stateNode: StateNodeConfig<TContext, TEvent>,
  parentPath: string[],
): string[] {
  const path = [...parentPath];
  let current = stateNode;

  while (current.initial && current.states) {
    path.push(current.initial);
    current = current.states[current.initial];
    if (!current) break;
  }

  return path;
}

/**
 * Get initial state value for the machine
 */
export function getInitialStateValue<TContext, TEvent extends EventObject>(
  machine: Machine<TContext, TEvent>,
): StateValue {
  const initialState = machine.config.states[machine.initialState];
  if (!initialState) {
    return machine.initialState;
  }

  // Check if it's a parallel state
  if (initialState.type === "parallel" && initialState.states) {
    const parallelValues: Record<string, StateValue> = {};
    for (const [key, childState] of Object.entries(initialState.states)) {
      // For parallel regions, just get the initial state of each region
      if (childState.initial && childState.states) {
        const childPath = resolveInitialState(childState, []);
        parallelValues[key] = pathToStateValue(childPath);
      } else {
        parallelValues[key] = key;
      }
    }
    return { [machine.initialState]: parallelValues };
  }

  // Resolve compound state
  const path = resolveInitialState(initialState, [machine.initialState]);
  return pathToStateValue(path);
}

/**
 * Compute the next state given current state and event
 */
export interface TransitionResult<TContext> {
  /** Next state value */
  nextState: StateValue;
  /** Updated context */
  nextContext: TContext;
  /** Whether a transition occurred */
  changed: boolean;
  /** Action results (effects) */
  effects?: unknown[];
  /** Updated history */
  historyValue?: Record<string, StateValue>;
}

function getValueAtPath(
  value: StateValue,
  path: string[],
): StateValue | undefined {
  // deno-lint-ignore no-explicit-any
  let current: any = value;
  for (const key of path) {
    if (
      current && typeof current === "object" && !Array.isArray(current) &&
      key in current
    ) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}

export function computeTransition<TContext, TEvent extends EventObject>(
  machine: Machine<TContext, TEvent>,
  currentState: StateValue,
  currentContext: TContext,
  event: TEvent,
  historyValue: Record<string, StateValue> | undefined,
  spawn?: (
    logic: ActorLogic<unknown, unknown, EventObject>,
    options?: { id?: string; input?: unknown },
  ) => unknown,
): TransitionResult<TContext> {
  const currentPaths = stateValueToPaths(currentState);

  // For parallel states, try to find transition in any region
  for (let pathIndex = 0; pathIndex < currentPaths.length; pathIndex++) {
    const currentPath = currentPaths[pathIndex];
    const result = findTransitionInPath(
      machine,
      currentPath,
      event,
      currentContext,
      machine.implementations,
      spawn,
    );

    if (result) {
      const { transition, fromPath } = result;

      // Determine target path (explicit)
      let fullTargetPath: string[] = fromPath;
      if (transition.target) {
        const targetSegments = transition.target.split(".");
        if (machine.config.states[targetSegments[0]]) {
          fullTargetPath = targetSegments;
        } else {
          const parentPath = fromPath.slice(0, -1);
          fullTargetPath = [...parentPath, ...targetSegments];
        }
      }

      // Find LCA (Longest Common Ancestor)
      let lcaIndex = 0;
      while (
        lcaIndex < fromPath.length &&
        lcaIndex < fullTargetPath.length &&
        fromPath[lcaIndex] === fullTargetPath[lcaIndex]
      ) {
        lcaIndex++;
      }

      // Handle external transition on self/ancestor
      if (lcaIndex === fromPath.length) {
        lcaIndex--;
      }

      // Resolve next state value (handling history, parallel, etc.)
      const nextStateValue = resolveTarget(
        machine,
        fullTargetPath,
        historyValue,
      );
      const nextPaths = stateValueToPaths(nextStateValue);
      const lcaPath = fromPath.slice(0, lcaIndex);

      // Identify affected paths in current state
      const affectedCurrentPaths = currentPaths.filter((p) =>
        p.length >= lcaIndex &&
        p.slice(0, lcaIndex).every((seg, i) => seg === lcaPath[i])
      );

      // Capture history for exited states
      const newHistoryValue = { ...(historyValue || {}) };
      const exitedPathsSet = new Set<string>();
      affectedCurrentPaths.forEach((p) => {
        for (let i = p.length; i >= lcaIndex; i--) {
          exitedPathsSet.add(p.slice(0, i).join("."));
        }
      });

      for (const pathStr of exitedPathsSet) {
        const path = pathStr.split(".");
        const stateNode = getStateNodeByPath(machine, path);
        if (
          stateNode &&
          (stateNode.type === "compound" || stateNode.type === "parallel" ||
            (stateNode.states && Object.keys(stateNode.states).length > 0))
        ) {
          const val = getValueAtPath(currentState, path);
          if (val !== undefined) {
            newHistoryValue[pathStr] = val;
          }
        }
      }

      const effects: unknown[] = [];
      const visitedExit = new Set<string>();
      const nodesToExit: {
        path: string[];
        config: StateNodeConfig<TContext, TEvent>;
      }[] = [];

      // Collect exit actions
      affectedCurrentPaths.forEach((p) => {
        for (let i = p.length; i > lcaIndex; i--) {
          const subPath = p.slice(0, i);
          const pathStr = subPath.join(".");
          if (!visitedExit.has(pathStr)) {
            visitedExit.add(pathStr);
            const node = getStateNodeByPath(machine, subPath);
            if (node) nodesToExit.push({ path: subPath, config: node });
          }
        }
      });

      nodesToExit.sort((a, b) => b.path.length - a.path.length);

      for (const { config } of nodesToExit) {
        if (config.exit) {
          const res = executeActions(
            config.exit,
            { context: currentContext, event, spawn },
            machine.implementations,
          );
          effects.push(...res);
        }
      }

      // Execute transition actions
      const transitionResults = executeActions(
        transition.actions,
        { context: currentContext, event, spawn },
        machine.implementations,
      );
      effects.push(...transitionResults);

      // Collect entry actions
      const affectedNextPaths = nextPaths.filter((p) =>
        p.length >= lcaIndex &&
        p.slice(0, lcaIndex).every((seg, i) => seg === lcaPath[i])
      );

      const visitedEnter = new Set<string>();
      const nodesToEnter: {
        path: string[];
        config: StateNodeConfig<TContext, TEvent>;
      }[] = [];

      affectedNextPaths.forEach((p) => {
        for (let i = lcaIndex + 1; i <= p.length; i++) {
          const subPath = p.slice(0, i);
          const pathStr = subPath.join(".");
          if (!visitedEnter.has(pathStr)) {
            visitedEnter.add(pathStr);
            const node = getStateNodeByPath(machine, subPath);
            if (node) nodesToEnter.push({ path: subPath, config: node });
          }
        }
      });

      nodesToEnter.sort((a, b) => a.path.length - b.path.length);

      for (const { config } of nodesToEnter) {
        if (config.entry) {
          const res = executeActions(
            config.entry,
            { context: currentContext, event, spawn },
            machine.implementations,
          );
          effects.push(...res);
        }
      }

      // Construct Final State
      const unaffectedPaths = currentPaths.filter((p) =>
        p.length < lcaIndex ||
        !p.slice(0, lcaIndex).every((seg, i) => seg === lcaPath[i])
      );

      const unaffectedStateValues = unaffectedPaths.map((p) =>
        pathToStateValue(p)
      );
      const finalState = mergeStateValues(
        ...unaffectedStateValues,
        nextStateValue,
      );

      const completedState = completeStateValue(
        machine,
        finalState,
        newHistoryValue,
      );

      return {
        nextState: completedState,
        nextContext: currentContext,
        changed: true,
        effects,
        historyValue: newHistoryValue,
      };
    }
  }

  // Try global transitions
  if (machine.config.on) {
    const definition = machine.config.on[event.type as TEvent["type"]];
    if (definition) {
      const globalTransition = findValidTransition(
        definition,
        currentContext,
        event,
        spawn,
        machine.implementations,
      );

      if (globalTransition && globalTransition.target) {
        const effects: unknown[] = [];

        // Execute exit actions for all current states
        for (const currentPath of currentPaths) {
          const exitNodes = getStateNodesInPath(machine, currentPath);
          for (let i = exitNodes.length - 1; i >= 0; i--) {
            const results = executeActions(
              exitNodes[i].exit,
              { context: currentContext, event, spawn },
              machine.implementations,
            );
            effects.push(...results);
          }
        }

        // Execute transition actions
        const transitionResults = executeActions(
          globalTransition.actions,
          { context: currentContext, event, spawn },
          machine.implementations,
        );
        effects.push(...transitionResults);

        // Resolve target
        const targetPath = globalTransition.target.split(".");
        const targetNode = getStateNodeByPath(machine, targetPath);
        let resolvedPath = targetPath;
        if (targetNode) {
          resolvedPath = resolveInitialState(targetNode, targetPath);
        }

        // Execute entry actions
        const entryNodes = getStateNodesInPath(machine, resolvedPath);
        for (const node of entryNodes) {
          const results = executeActions(
            node.entry,
            { context: currentContext, event, spawn },
            machine.implementations,
          );
          effects.push(...results);
        }

        return {
          nextState: pathToStateValue(resolvedPath),
          nextContext: currentContext,
          changed: true,
          effects,
        };
      }
    }
  }

  // No transition found
  return {
    nextState: currentState,
    nextContext: currentContext,
    changed: false,
  };
}

/**
 * Helper to wrap a state value in a path
 */
function wrapValueInPath(path: string[], value: StateValue): StateValue {
  if (path.length === 0) return value;
  const [first, ...rest] = path;
  return { [first]: wrapValueInPath(rest, value) };
}

/**
 * Recursively resolve a state node to its state value
 */
function recursiveResolve<TContext, TEvent extends EventObject>(
  machine: Machine<TContext, TEvent>,
  stateNode: StateNodeConfig<TContext, TEvent>,
  path: string[],
  historyValue: Record<string, StateValue>,
): StateValue {
  // Handle history states
  if (stateNode.type === "history") {
    const parentPath = path.slice(0, -1);
    const parentPathStr = parentPath.join(".");
    const history = historyValue[parentPathStr];

    if (history) {
      const type = stateNode.history === "deep" ? "deep" : "shallow";
      const value = getHistoryValue(history, type);
      return wrapValueInPath(parentPath, value);
    }

    // Default history target
    if (stateNode.target) {
      const targetPath = stateNode.target.split(".");
      let resolvedPath: string[];

      // Check if absolute
      if (machine.config.states[targetPath[0]]) {
        resolvedPath = targetPath;
      } else {
        // Relative to parent
        resolvedPath = [...parentPath, ...targetPath];
      }

      return resolveTarget(machine, resolvedPath, historyValue);
    }

    // Fallback to parent initial state
    const parentNode = getStateNodeByPath(machine, parentPath);
    if (parentNode?.initial) {
      const initialPath = [...parentPath, parentNode.initial];
      return resolveTarget(machine, initialPath, historyValue);
    }
  }

  // Handle atomic states
  if (!stateNode.states || Object.keys(stateNode.states).length === 0) {
    return pathToStateValue(path);
  }

  // Handle parallel states
  if (stateNode.type === "parallel") {
    const subValues: StateValue[] = [];
    if (stateNode.states) {
      for (const [key, childNode] of Object.entries(stateNode.states)) {
        const childPath = [...path, key];
        subValues.push(
          recursiveResolve(machine, childNode, childPath, historyValue),
        );
      }
    }
    return mergeStateValues(...subValues);
  }

  // Handle compound states
  if (stateNode.initial) {
    const initialPath = [...path, stateNode.initial];
    const initialNode = stateNode.states?.[stateNode.initial];
    if (initialNode) {
      return recursiveResolve(machine, initialNode, initialPath, historyValue);
    }
  }

  return pathToStateValue(path);
}

/**
 * Resolve a target path to a state value, handling history and parallel states
 */
export function resolveTarget<TContext, TEvent extends EventObject>(
  machine: Machine<TContext, TEvent>,
  targetPath: string[],
  historyValue: Record<string, StateValue> = {},
): StateValue {
  const stateNode = getStateNodeByPath(machine, targetPath);
  if (!stateNode) {
    // If node doesn't exist, assume it's a valid leaf state path
    return pathToStateValue(targetPath);
  }

  return recursiveResolve(machine, stateNode, targetPath, historyValue);
}

/**
 * Ensure all parallel regions are present in the state value
 */
function completeStateValue<TContext, TEvent extends EventObject>(
  machine: Machine<TContext, TEvent>,
  stateValue: StateValue,
  historyValue: Record<string, StateValue>,
): StateValue {
  return fillParallelStates(
    machine,
    machine.config.states,
    stateValue,
    [],
    historyValue,
  );
}

function fillParallelStates<TContext, TEvent extends EventObject>(
  machine: Machine<TContext, TEvent>,
  nodes: Record<string, StateNodeConfig<TContext, TEvent>>,
  value: StateValue,
  path: string[],
  historyValue: Record<string, StateValue>,
): StateValue {
  if (Array.isArray(value)) {
    return value.map((v) =>
      fillParallelStates(machine, nodes, v, path, historyValue)
    );
  }

  if (typeof value === "object" && value !== null) {
    const result = { ...(value as Record<string, StateValue>) };

    for (const [key, subValue] of Object.entries(result)) {
      const node = nodes[key];
      if (node) {
        // If node is parallel, ensure all regions are present
        if (node.type === "parallel" && node.states) {
          let currentSubValue = subValue;
          if (
            typeof currentSubValue === "object" &&
            !Array.isArray(currentSubValue) &&
            currentSubValue !== null
          ) {
            const missingRegions: Record<string, StateValue> = {};
            for (const regionKey of Object.keys(node.states)) {
              if (!(regionKey in currentSubValue)) {
                const regionNode = node.states[regionKey];
                const regionPath = [...path, key, regionKey];
                const resolved = recursiveResolve(
                  machine,
                  regionNode,
                  regionPath,
                  historyValue,
                );
                const relative = getValueAtPath(resolved, regionPath);
                if (relative !== undefined) {
                  missingRegions[regionKey] = relative;
                }
              }
            }
            if (Object.keys(missingRegions).length > 0) {
              currentSubValue = {
                ...(currentSubValue as Record<string, StateValue>),
                ...missingRegions,
              };
              result[key] = currentSubValue;
            }
          }
        }

        // Recurse
        result[key] = fillParallelStates(
          machine,
          node.states || {},
          result[key],
          [...path, key],
          historyValue,
        );
      }
    }
    return result;
  }

  return value;
}

/**
 * Normalize transition definition to array of config objects
 */
function normalizeTransitionDefinition<TContext, TEvent extends EventObject>(
  definition: TransitionDefinition<TContext, TEvent>,
): TransitionConfig<TContext, TEvent>[] {
  if (Array.isArray(definition)) {
    return definition.map((d) =>
      typeof d === "string" ? { target: d } : d
    ) as TransitionConfig<TContext, TEvent>[];
  }
  if (typeof definition === "string") {
    return [{ target: definition }];
  }
  return [definition as TransitionConfig<TContext, TEvent>];
}

/**
 * Find the first valid transition from a definition
 */
function findValidTransition<TContext, TEvent extends EventObject>(
  definition: TransitionDefinition<TContext, TEvent>,
  context: TContext,
  event: TEvent,
  spawn?: (
    logic: ActorLogic<unknown, unknown, EventObject>,
    options?: { id?: string; input?: unknown },
  ) => unknown,
  implementations?: MachineImplementations<TContext, TEvent>,
): TransitionConfig<TContext, TEvent> | null {
  const transitions = normalizeTransitionDefinition(definition);

  for (const transition of transitions) {
    const guardPassed = evaluateGuard(
      transition.guard,
      { context, event, spawn },
      implementations,
    );
    if (guardPassed) {
      return transition;
    }
  }

  return null;
}
