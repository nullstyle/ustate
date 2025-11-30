/**
 * Spawn action for creating dynamic actors
 */

import type {
  ActionContext,
  ActorLogic,
  ActorRef,
  EventObject,
  Machine,
  StateSnapshot,
  Subscription,
} from '../core/types.ts';
import { createActor } from '../core/actor.ts';
import { createInvokedActor } from '../actors/invoke.ts';

/**
 * Spawned actor reference
 */
export interface SpawnedActorRef<TEvent extends EventObject = EventObject> {
  id: string;
  send: (event: TEvent) => void;
  stop: () => void;
  getSnapshot: () => StateSnapshot<any>;
  subscribe?: (observer: (state: StateSnapshot<any>) => void) => Subscription;
}

/**
 * Spawn options
 */
export interface SpawnOptions {
  id?: string;
  input?: any;
  syncSnapshot?: boolean;
}

/**
 * Spawn context - provided to actions that can spawn actors
 */
export interface SpawnContext {
  spawn: <TLogic extends ActorLogic<any, any, any>>(
    logic: TLogic,
    options?: SpawnOptions
  ) => SpawnedActorRef;
  spawnedActors: Map<string, SpawnedActorRef>;
}

/**
 * Extended action context with spawn capability
 */
export interface SpawnableActionContext<TContext, TEvent extends EventObject>
  extends ActionContext<TContext, TEvent> {
  spawn: <TLogic extends ActorLogic<any, any, any>>(
    logic: TLogic,
    options?: SpawnOptions
  ) => SpawnedActorRef;
}

/**
 * Create a spawn function for an actor
 */
export function createSpawnFunction(
  spawnedActors: Map<string, SpawnedActorRef>,
  sendParent: (event: EventObject) => void
): SpawnContext['spawn'] {
  return function spawn<TLogic extends ActorLogic<any, any, any>>(
    logic: TLogic,
    options: SpawnOptions = {}
  ): SpawnedActorRef {
    const actorId = options.id || `spawned-${Math.random().toString(36).slice(2, 9)}`;

    // Check if actor with this ID already exists
    if (spawnedActors.has(actorId)) {
      throw new Error(`Actor with id "${actorId}" already exists`);
    }

    // Create the actor based on logic type
    let actorRef: SpawnedActorRef;

    if (isMachine(logic)) {
      // Machine actor
      const machine = logic as Machine<any, any>;
      const actor = createActor(machine);
      actor.start();

      actorRef = {
        id: actorId,
        send: (e) => actor.send(e),
        stop: () => actor.stop(),
        getSnapshot: () => actor.getSnapshot(),
        subscribe: (observer) => actor.subscribe(observer),
      };
    } else {
      // Use invoke actor creation for promise/callback logic
      const invokeConfig = {
        id: actorId,
        src: logic,
        input: options.input,
      };

      actorRef = createInvokedActor(
        invokeConfig,
        {},
        { type: '$spawn' },
        sendParent
      ) as SpawnedActorRef;
    }

    // Register the spawned actor
    spawnedActors.set(actorId, actorRef);

    return actorRef;
  };
}

/**
 * Type guard for machine logic
 */
function isMachine(logic: ActorLogic<any, any, any>): boolean {
  return (
    typeof logic === 'object' &&
    'config' in logic &&
    'initialState' in logic
  );
}

/**
 * Stop all spawned actors
 */
export function stopAllSpawnedActors(
  spawnedActors: Map<string, SpawnedActorRef>
): void {
  for (const actor of spawnedActors.values()) {
    try {
      actor.stop();
    } catch (error) {
      console.error(`Error stopping spawned actor ${actor.id}:`, error);
    }
  }
  spawnedActors.clear();
}

/**
 * Create sendTo action for sending events to spawned actors
 */
export function sendTo<TEvent extends EventObject>(
  actorId: string,
  event: TEvent | ((context: any, actionEvent: any) => TEvent)
) {
  return ({ context, event: actionEvent }: ActionContext<any, any>) => {
    // This will be handled by the actor system
    // We need to store this intent and execute it in the actor
    const resolvedEvent = typeof event === 'function'
      ? event(context, actionEvent)
      : event;

    // This is a marker action that will be intercepted
    return {
      type: '$$sendTo',
      actorId,
      event: resolvedEvent,
    };
  };
}

/**
 * Create sendParent action for child actors
 */
export function sendParent<TEvent extends EventObject>(
  event: TEvent | ((context: any, actionEvent: any) => TEvent)
) {
  return ({ context, event: actionEvent }: ActionContext<any, any>) => {
    const resolvedEvent = typeof event === 'function'
      ? event(context, actionEvent)
      : event;

    return {
      type: '$$sendParent',
      event: resolvedEvent,
    };
  };
}
