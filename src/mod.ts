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
export { toMermaid } from "./mermaid.ts";

// Actions
export { assign } from "./actions/assign.ts";

// System services (for testing and deterministic replay)
export {
  createCounterServices,
  createDeterministicServices,
  defaultServices,
  getServices,
  resetServices,
  setServices,
  withServices,
  withServicesAsync,
} from "./core/services.ts";
export type { SystemServices } from "./core/services.ts";

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
