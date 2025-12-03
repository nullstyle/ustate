/**
 * ustate - A simplified XState-compatible state machine library
 *
 * @module
 */

// Core exports
export { createMachine } from "./core/machine.ts";
export { createActor } from "./core/actor.ts";
export { setup } from "./setup.ts";

// Utilities
export { waitFor } from "./utils.ts";

// Actions
export { assign } from "./actions/assign.ts";

// Actor logic
export { fromCallback, fromPromise } from "./actors/logic.ts";

// Types
export type {
  ActionFunction,
  ActorRef,
  EventObject,
  GuardFunction,
  Machine,
  MachineConfig,
  Observer,
  StateNodeConfig,
  StateSnapshot,
  Subscription,
  TransitionConfig,
} from "./core/types.ts";
export type { WaitForOptions } from "./utils.ts";
