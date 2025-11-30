/**
 * Actor implementation for running state machines
 */

import type {
  ActorRef,
  EventObject,
  InvokeConfig,
  Machine,
  Observer,
  StateSnapshot,
  StateValue,
  Subscription,
} from "./types.ts";
import { createStateSnapshot } from "./state.ts";
import {
  computeTransition,
  executeActions,
  getInitialStateValue,
  getStateNodeByPath,
  getStateNodesInPath,
  resolveDelay,
} from "./transition.ts";
import { stateValueToPaths } from "./stateValue.ts";
import { createInvokedActor } from "../actors/invoke.ts";
import {
  createSpawnFunction,
  type SpawnedActorRef,
  stopAllSpawnedActors,
} from "../actions/spawn.ts";

/**
 * Deep clone a value, preserving functions and handling circular references
 */
function deepClone<T>(value: T, seen = new WeakMap()): T {
  // Primitives and functions
  if (value === null || typeof value !== "object") {
    return value;
  }

  // Handle circular references
  if (seen.has(value)) {
    return seen.get(value);
  }

  // Date
  if (value instanceof Date) {
    return new Date(value) as any;
  }

  // RegExp
  if (value instanceof RegExp) {
    return new RegExp(value) as any;
  }

  // Map
  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [k, v] of value) {
      copy.set(deepClone(k, seen), deepClone(v, seen));
    }
    return copy as any;
  }

  // Set
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const v of value) {
      copy.add(deepClone(v, seen));
    }
    return copy as any;
  }

  // Array
  if (Array.isArray(value)) {
    const copy: any[] = [];
    seen.set(value, copy);
    for (let i = 0; i < value.length; i++) {
      copy[i] = deepClone(value[i], seen);
    }
    return copy as any;
  }

  // Plain Object
  const copy = {} as any;
  seen.set(value, copy);
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      copy[key] = deepClone((value as any)[key], seen);
    }
  }
  return copy;
}

/**
 * Clone context safely
 */
function cloneContext<T>(context: T): T {
  try {
    return structuredClone(context);
  } catch (_e) {
    return deepClone(context);
  }
}

// Internal interface for invoked actors (matching the one in invoke.ts)
interface InvokedActorRef {
  id: string;
  send: (event: any) => void;
  stop: () => void;
  getSnapshot: () => StateSnapshot<any>;
  subscribe?: (observer: (state: StateSnapshot<any>) => void) => Subscription;
}

/**
 * Create an actor from a machine
 *
 * @example
 * ```ts
 * const actor = createActor(machine);
 * actor.subscribe((state) => {
 *   console.log(state.value, state.context);
 * });
 * actor.start();
 * actor.send({ type: 'EVENT' });
 * ```
 */
export interface ActorOptions {
  sendParent?: (event: EventObject) => void;
}

export function createActor<TContext, TEvent extends EventObject>(
  machine: Machine<TContext, TEvent>,
  options?: ActorOptions,
): ActorRef<TContext, TEvent> {
  let currentState: StateValue;
  let currentContext: TContext;
  let historyValue: Record<string, StateValue> = {};
  let started = false;
  const observers: Set<Observer<TContext>> = new Set();
  // Map of path string -> invoked actors for that path
  const invokedActors: Map<string, InvokedActorRef[]> = new Map();
  // Map of path string -> timer IDs for delayed transitions
  const delayedTransitions: Map<string, any[]> = new Map();
  const spawnedActors: Map<string, SpawnedActorRef> = new Map();
  const spawnFn = createSpawnFunction(
    spawnedActors,
    (e) => processEvent(e as TEvent),
  );

  // Initialize context
  const initialContext = machine.config.context;
  if (typeof initialContext === "function") {
    currentContext = (initialContext as () => TContext)();
  } else if (initialContext !== undefined) {
    // Deep clone to avoid mutations
    currentContext = cloneContext(initialContext);
  } else {
    currentContext = {} as TContext;
  }

  // Initialize state value
  currentState = getInitialStateValue(machine);

  /**
   * Check if an event can be handled in the current state
   */
  function canHandle(event: EventObject): boolean {
    const paths = stateValueToPaths(currentState);

    // Check each active state path
    for (const path of paths) {
      // Check from leaf to root
      for (let i = path.length; i > 0; i--) {
        const currentPath = path.slice(0, i);
        let stateNode = machine.config.states[currentPath[0]];

        // Navigate to the state node
        for (let j = 1; j < currentPath.length; j++) {
          if (!stateNode?.states) break;
          stateNode = stateNode.states[currentPath[j]];
        }

        if (stateNode?.on && stateNode.on[event.type as TEvent["type"]]) {
          return true;
        }
      }
    }

    // Check global transitions
    if (machine.config.on && machine.config.on[event.type as TEvent["type"]]) {
      return true;
    }

    return false;
  }

  /**
   * Get current state snapshot
   */
  function getSnapshot(): StateSnapshot<TContext> {
    return createStateSnapshot(currentState, currentContext, canHandle);
  }

  /**
   * Notify all observers of state change
   */
  function notify(): void {
    const snapshot = getSnapshot();
    observers.forEach((observer) => {
      try {
        observer(snapshot);
      } catch (error) {
        console.error("Error in observer:", error);
      }
    });
  }

  /**
   * Process action effects
   */
  function processEffects(effects: any[]): void {
    for (const effect of effects) {
      if (!effect || typeof effect !== "object") continue;

      if (effect.type === "$$sendTo") {
        const { actorId, event: eventToSend } = effect;

        // Check spawned actors
        const spawned = spawnedActors.get(actorId);
        if (spawned) {
          spawned.send(eventToSend);
          continue;
        }

        // Check invoked actors
        let found = false;
        for (const actors of invokedActors.values()) {
          const actor = actors.find((a) => a.id === actorId);
          if (actor) {
            actor.send(eventToSend);
            found = true;
            break;
          }
        }

        if (!found) {
          console.warn(`Actor with id "${actorId}" not found`);
        }
      } else if (effect.type === "$$sendParent") {
        if (options?.sendParent) {
          options.sendParent(effect.event);
        } else {
          console.warn("sendParent called but no parent actor defined");
        }
      }
    }
  }

  /**
   * Process an event (can be called internally for invoked actor events)
   */
  function processEvent(event: TEvent | EventObject): void {
    if (!started) {
      console.warn("Actor not started. Call start() before sending events.");
      return;
    }

    // Make a copy of context for this transition
    const contextCopy = cloneContext(currentContext);

    const previousState = currentState;

    let result = computeTransition(
      machine,
      currentState,
      contextCopy,
      event as TEvent,
      historyValue,
      spawnFn,
    );

    // Update state and context
    currentState = result.nextState;
    currentContext = result.nextContext;
    if (result.historyValue) {
      historyValue = result.historyValue;
    }

    // Handle invoked actors if state changed
    if (result.changed && previousState !== currentState) {
      handleInvokedActors(previousState, currentState, event as TEvent);
    }

    // Process effects
    if (result.effects) {
      processEffects(result.effects);
    }

    // Handle transient transitions (always)
    if (result.changed) {
      processAlways(event);
    }
  }

  /**
   * Process transient 'always' transitions
   */
  function processAlways(triggerEvent: TEvent | EventObject): void {
    let steps = 0;
    let keepGoing = true;

    while (keepGoing && steps < 100) {
      const transientEvent = { ...triggerEvent, type: "$$always" } as TEvent;
      const prevTransientState = currentState;
      const transientContext = cloneContext(currentContext);

      const result = computeTransition(
        machine,
        currentState,
        transientContext,
        transientEvent,
        historyValue,
        spawnFn,
      );

      if (result.changed) {
        currentState = result.nextState;
        currentContext = result.nextContext;
        if (result.historyValue) {
          historyValue = result.historyValue;
        }

        // Handle invoked actors for transient state changes
        handleInvokedActors(
          prevTransientState,
          currentState,
          triggerEvent as TEvent,
        );

        // Process effects
        if (result.effects) {
          processEffects(result.effects);
        }
        steps++;
      } else {
        keepGoing = false;
      }
    }

    if (steps >= 100) {
      console.warn("Possible infinite loop in always transitions");
    }
  }

  /**
   * Helper to start invocations for a specific state node
   */
  function startDelays(
    stateNode: any,
    pathStr: string,
    event: TEvent,
  ): void {
    if (stateNode.after) {
      const timers: any[] = [];
      for (const key of Object.keys(stateNode.after)) {
        const delay = resolveDelay(
          key,
          { context: currentContext, event },
          machine.implementations,
        );
        const timerId = setTimeout(() => {
          processEvent({ type: "$delay", key } as any);
        }, delay);
        timers.push(timerId);
      }
      delayedTransitions.set(pathStr, timers);
    }
  }

  function stopDelays(pathStr: string): void {
    const timers = delayedTransitions.get(pathStr);
    if (timers) {
      timers.forEach((id) => clearTimeout(id));
      delayedTransitions.delete(pathStr);
    }
  }

  /**
   * Helper to start invocations for a specific state node
   */
  function startInvocations(
    invokeConfig: InvokeConfig<TContext, TEvent> | InvokeConfig<
      TContext,
      TEvent
    >[],
    pathStr: string,
    event: TEvent,
  ): void {
    const invocations = Array.isArray(invokeConfig)
      ? invokeConfig
      : [invokeConfig];
    const actors: InvokedActorRef[] = [];

    for (const config of invocations) {
      const actor = createInvokedActor(
        config,
        currentContext,
        event,
        (e) => processEvent(e as TEvent),
      ) as InvokedActorRef;
      actors.push(actor);
    }

    if (actors.length > 0) {
      invokedActors.set(pathStr, actors);
    }

    // Notify observers
    notify();
  }

  /**
   * Handle invoked actors when state changes
   */
  function handleInvokedActors(
    previousState: StateValue,
    newState: StateValue,
    event: TEvent,
  ): void {
    const previousPaths = stateValueToPaths(previousState);
    const newPaths = stateValueToPaths(newState);

    // Get all active path strings (including ancestors)
    const prevActive = new Set<string>();
    for (const path of previousPaths) {
      for (let i = 0; i < path.length; i++) {
        prevActive.add(path.slice(0, i + 1).join("."));
      }
    }

    const nextActive = new Set<string>();
    for (const path of newPaths) {
      for (let i = 0; i < path.length; i++) {
        nextActive.add(path.slice(0, i + 1).join("."));
      }
    }

    // Stop invocations from exited states
    for (const pathStr of prevActive) {
      if (!nextActive.has(pathStr)) {
        const actors = invokedActors.get(pathStr);
        if (actors) {
          actors.forEach((actor) => actor.stop());
          invokedActors.delete(pathStr);
        }
        stopDelays(pathStr);
      }
    }

    // Start invocations for entered states
    for (const pathStr of nextActive) {
      if (!prevActive.has(pathStr)) {
        const path = pathStr.split(".");
        const stateNode = getStateNodeByPath(machine, path);

        if (stateNode) {
          if (stateNode.invoke) {
            startInvocations(stateNode.invoke, pathStr, event);
          }
          startDelays(stateNode, pathStr, event);
        }
      }
    }
  }

  const actor: ActorRef<TContext, TEvent> = {
    start(): ActorRef<TContext, TEvent> {
      if (started) {
        console.warn("Actor already started");
        return actor;
      }

      started = true;

      // Execute entry actions for initial state(s)
      const paths = stateValueToPaths(currentState);
      for (const path of paths) {
        const nodes = getStateNodesInPath(machine, path);
        for (const node of nodes) {
          if (node.entry) {
            const effects = executeActions(
              node.entry,
              {
                context: currentContext,
                event: { type: "$init" } as TEvent,
                spawn: spawnFn,
              },
              machine.implementations,
            );
            processEffects(effects);
          }
        }
      }

      // Start invoked actors for initial state(s)
      for (const path of paths) {
        const nodes = getStateNodesInPath(machine, path);

        nodes.forEach((node, index) => {
          const nodePath = path.slice(0, index + 1);
          const pathStr = nodePath.join(".");

          if (!invokedActors.has(pathStr) && node.invoke) {
            startInvocations(node.invoke, pathStr, { type: "$init" } as TEvent);
          }
          if (!delayedTransitions.has(pathStr)) {
            startDelays(node, pathStr, { type: "$init" } as TEvent);
          }
        });
      }

      // Check always transitions for initial state
      processAlways({ type: "$init" });

      // Notify initial state
      notify();

      return actor;
    },

    send(event: TEvent): void {
      processEvent(event);
    },

    subscribe(observer: Observer<TContext>): Subscription {
      observers.add(observer);

      return {
        unsubscribe(): void {
          observers.delete(observer);
        },
      };
    },

    stop(): void {
      if (!started) {
        console.warn("Actor not started");
        return;
      }

      // Stop all spawned actors
      stopAllSpawnedActors(spawnedActors);

      // Stop all invoked actors
      for (const actors of invokedActors.values()) {
        actors.forEach((actor) => actor.stop());
      }
      invokedActors.clear();

      for (const timers of delayedTransitions.values()) {
        timers.forEach((id) => clearTimeout(id));
      }
      delayedTransitions.clear();

      // Execute exit actions for all current states
      const paths = stateValueToPaths(currentState);
      for (const path of paths) {
        const nodes = getStateNodesInPath(machine, path);
        for (let i = nodes.length - 1; i >= 0; i--) {
          if (nodes[i].exit) {
            const effects = executeActions(
              nodes[i].exit,
              {
                context: currentContext,
                event: { type: "$stop" } as TEvent,
                spawn: spawnFn,
              },
              machine.implementations,
            );
            processEffects(effects);
          }
        }
      }

      started = false;
      observers.clear();
    },

    getSnapshot(): StateSnapshot<TContext> {
      return getSnapshot();
    },
  };

  return actor;
}
