/**
 * Invoked actor management
 */

import type {
  ActorLogic,
  CallbackLogic,
  EventObject,
  InvokeConfig,
  Machine,
  PromiseLogic,
  StateSnapshot,
  Subscription,
} from "../core/types.ts";
import { createActor } from "../core/actor.ts";

/**
 * Internal actor reference for invoked actors
 */
interface InvokedActorRef<TEvent extends EventObject = EventObject> {
  id: string;
  send: (event: TEvent) => void;
  stop: () => void;
  getSnapshot: () => StateSnapshot<unknown>;
  subscribe?: (
    observer: (state: StateSnapshot<unknown>) => void,
  ) => Subscription;
}

/**
 * Create an invoked actor from logic
 */
export function createInvokedActor<TContext, TEvent extends EventObject>(
  config: InvokeConfig<TContext, TEvent>,
  context: TContext,
  event: TEvent,
  sendParent: (event: EventObject) => void,
): InvokedActorRef {
  const { src, input, id, onDone, onError } = config;
  const _src = src;
  const _input = input;
  const _id = id;
  const _onDone = onDone;

  const actorId = id || `invoked-${Math.random().toString(36).slice(2, 9)}`;

  // Resolve input
  let resolvedInput: unknown;
  if (typeof input === "function") {
    // deno-lint-ignore no-explicit-any
    resolvedInput = input({ context, event } as any);
  } else {
    resolvedInput = input;
  }

  // Handle different actor logic types
  if (isMachine(src)) {
    // Machine actor
    // deno-lint-ignore no-explicit-any
    const machine = src as Machine<any, any>;
    const actor = createActor(machine, { sendParent });

    // Subscribe to completion if onDone is specified
    // Note: This part is incomplete as ustate doesn't fully support
    // final states for invoked machines yet in a way that triggers onDone
    // properly. However, for compatibility, we acknowledge onDone exists.

    actor.start();

    return {
      id: actorId,
      send: (e) => actor.send(e),
      stop: () => actor.stop(),
      getSnapshot: () => actor.getSnapshot(),
      subscribe: (observer) => actor.subscribe(observer),
    };
  } else if (isPromiseLogic(src)) {
    // Promise actor
    // deno-lint-ignore no-explicit-any
    const promiseLogic = src as PromiseLogic<any, any>;
    let stopped = false;
    // deno-lint-ignore no-explicit-any
    let currentSnapshot: StateSnapshot<any> = {
      value: "pending",
      context: {},
      matches: (v) => v === "pending",
      can: () => false,
    };

    // Execute the promise
    Promise.resolve()
      .then(() => promiseLogic.logic(resolvedInput))
      .then((output) => {
        if (stopped) return;

        currentSnapshot = {
          value: "done",
          context: { output },
          matches: (v) => v === "done",
          can: () => false,
        };

        // Send done event to parent
        // Use standard done event type
        sendParent({
          type: `done.invoke.${actorId}`,
          output,
        });
      })
      .catch((error) => {
        if (stopped) return;

        currentSnapshot = {
          value: "error",
          context: { error },
          matches: (v) => v === "error",
          can: () => false,
        };

        // Send error event to parent
        // Use standard error event type
        sendParent({
          type: `error.invoke.${actorId}`,
          error,
        });

        // Also check if we should log it (if no onError handler in parent)
        // Note: This logic is tricky because we don't know if the parent handles it.
        // We rely on the parent machine's transition logic to handle the event.
        // However, we previously logged here if onError was missing.
        // Since we always send the event now, logging is handled by the parent
        // if it fails to process the error event? No, that's not how XState works.
        // XState crashes/logs if error is unhandled.
        // For now, we will log if onError is NOT defined in the invocation config,
        // although this is a slight deviation if the parent handles it via global onError.
        if (!onError) {
          // Log unhandled error to prevent it from being swallowed
          console.error(
            `Unhandled error in invoked actor "${actorId}":`,
            error,
          );
        }
      });

    return {
      id: actorId,
      send: () => {}, // Promises don't receive events
      stop: () => {
        stopped = true;
      },
      getSnapshot: () => currentSnapshot,
    };
  } else if (isCallbackLogic(src)) {
    // Callback actor
    // deno-lint-ignore no-explicit-any
    const callbackLogic = src as CallbackLogic<any>;
    let cleanup: (() => void) | void;
    let stopped = false;
    const listeners: Array<(event: EventObject) => void> = [];

    const sendBack = (e: EventObject) => {
      if (stopped) return;
      sendParent(e);
    };

    const receive = (listener: (event: EventObject) => void) => {
      listeners.push(listener);
    };

    try {
      cleanup = callbackLogic.logic({
        sendBack,
        receive,
        input: resolvedInput,
      });
    } catch (error) {
      sendParent({
        type: `error.invoke.${actorId}`,
        error,
      });
    }

    return {
      id: actorId,
      send: (e) => {
        if (stopped) return;
        listeners.forEach((listener) => listener(e));
      },
      stop: () => {
        stopped = true;
        if (cleanup) cleanup();
      },
      getSnapshot: () => ({
        value: "active",
        context: {},
        matches: (v) => v === "active",
        can: () => false,
      }),
    };
  }

  throw new Error(`Unsupported actor logic type`);
}

/**
 * Type guards
 */
// deno-lint-ignore no-explicit-any
function isMachine(src: ActorLogic<any, any, any> | string): boolean {
  return typeof src === "object" && "config" in src && "initialState" in src;
}

function isPromiseLogic(
  // deno-lint-ignore no-explicit-any
  src: ActorLogic<any, any, any> | string,
): boolean {
  return typeof src === "object" && "__type" in src && src.__type === "promise";
}

function isCallbackLogic(
  // deno-lint-ignore no-explicit-any
  src: ActorLogic<any, any, any> | string,
): boolean {
  return typeof src === "object" && "__type" in src &&
    src.__type === "callback";
}

/**
 * Manage invoked actors for a state
 */
export class InvokeManager {
  private actors: Map<string, InvokedActorRef> = new Map();
  private pathMap: Map<string, Set<string>> = new Map();

  /**
   * Start invoked actors for a state
   */
  startInvocations<TContext, TEvent extends EventObject>(
    sourcePath: string,
    invocations: InvokeConfig<TContext, TEvent> | InvokeConfig<
      TContext,
      TEvent
    >[],
    context: TContext,
    event: TEvent,
    sendParent: (event: EventObject) => void,
  ): void {
    const configs = Array.isArray(invocations) ? invocations : [invocations];

    if (!this.pathMap.has(sourcePath)) {
      this.pathMap.set(sourcePath, new Set());
    }
    const pathActors = this.pathMap.get(sourcePath)!;

    for (const config of configs) {
      const actor = createInvokedActor(config, context, event, sendParent);

      // If actor with same ID exists, stop it first
      if (this.actors.has(actor.id)) {
        const existing = this.actors.get(actor.id);
        existing?.stop();
      }

      this.actors.set(actor.id, actor);
      pathActors.add(actor.id);
    }
  }

  /**
   * Stop invoked actors for a specific state path
   */
  stopInvocations(sourcePath: string): void {
    const actorIds = this.pathMap.get(sourcePath);
    if (!actorIds) return;

    for (const id of actorIds) {
      const actor = this.actors.get(id);
      if (actor) {
        actor.stop();
        this.actors.delete(id);
      }
    }
    this.pathMap.delete(sourcePath);
  }

  /**
   * Stop all invoked actors
   */
  stopAll(): void {
    for (const actor of this.actors.values()) {
      actor.stop();
    }
    this.actors.clear();
    this.pathMap.clear();
  }

  /**
   * Send event to a specific invoked actor
   */
  sendTo(id: string, event: EventObject): void {
    const actor = this.actors.get(id);
    if (actor) {
      actor.send(event);
    }
  }

  /**
   * Get an invoked actor by ID
   */
  get(id: string): InvokedActorRef | undefined {
    return this.actors.get(id);
  }

  /**
   * Get all invoked actors
   */
  getAll(): InvokedActorRef[] {
    return Array.from(this.actors.values());
  }
}
