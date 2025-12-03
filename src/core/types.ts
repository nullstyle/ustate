/**
 * Core type definitions for ustate
 */

/**
 * Base event object that all events must extend
 */
export interface EventObject {
  /** The type of the event */
  type: string;
  /** Additional event data */
  [key: string]: unknown;
}

/**
 * Action execution context
 */
export interface ActionContext<TContext, TEvent extends EventObject> {
  /** Current context */
  context: TContext;
  /** Event that triggered the action */
  event: TEvent;
  /** Spawn an actor */
  spawn?: (
    logic: ActorLogic<unknown, unknown, EventObject>,
    options?: { id?: string; input?: unknown },
  ) => unknown;
}

/**
 * Action function type
 */
export type ActionFunction<TContext, TEvent extends EventObject> = (
  args: ActionContext<TContext, TEvent>,
) => void;

/**
 * Action definition - can be a function or object with type
 */
export type ActionDefinition<TContext, TEvent extends EventObject> =
  | ActionFunction<TContext, TEvent>
  | { type: string; [key: string]: unknown };

/**
 * Guard function type
 */
export type GuardFunction<TContext, TEvent extends EventObject> = (
  args: ActionContext<TContext, TEvent>,
) => boolean;

/**
 * Guard definition - can be a function or object with type
 */
export type GuardDefinition<TContext, TEvent extends EventObject> =
  | GuardFunction<TContext, TEvent>
  | { type: string; [key: string]: unknown };

/**
 * Delay function type
 */
export type DelayFunction<TContext, TEvent extends EventObject> = (
  args: ActionContext<TContext, TEvent>,
) => number;

/**
 * Transition configuration
 */
export interface TransitionConfig<TContext, TEvent extends EventObject> {
  /** Target state to transition to */
  target?: string;
  /** Actions to execute during transition */
  actions?: ActionDefinition<TContext, TEvent> | ActionDefinition<
    TContext,
    TEvent
  >[];
  /** Guard condition for the transition */
  guard?: GuardDefinition<TContext, TEvent>;
}

/**
 * Transition definition - can be a string target, a transition config object, or an array of them
 */
export type TransitionDefinition<TContext, TEvent extends EventObject> =
  | string
  | TransitionConfig<TContext, TEvent>
  | (string | TransitionConfig<TContext, TEvent>)[];

/**
 * Map of event types to transitions
 */
export type TransitionMap<TContext, TEvent extends EventObject> = {
  [K in TEvent["type"]]?: TransitionDefinition<TContext, TEvent>;
};

/**
 * Actor logic types
 */
export type ActorLogic<
  TInput = unknown,
  TOutput = unknown,
  TEvent extends EventObject = EventObject,
> =
  | Machine<unknown, TEvent>
  | PromiseLogic<TInput, TOutput>
  | CallbackLogic<TEvent>;

/**
 * Promise-based actor logic
 */
export interface PromiseLogic<TInput = unknown, TOutput = unknown> {
  __type: "promise";
  logic: (input: TInput) => Promise<TOutput>;
}

/**
 * Callback-based actor logic
 */
export interface CallbackLogic<TEvent extends EventObject = EventObject> {
  __type: "callback";
  logic: (params: {
    sendBack: (event: TEvent) => void;
    receive: (listener: (event: TEvent) => void) => void;
    input: unknown;
  }) => (() => void) | void;
}

/**
 * Invoke configuration
 */
export interface InvokeConfig<TContext, TEvent extends EventObject> {
  id?: string;
  src: ActorLogic<unknown, unknown, EventObject> | string;
  input?:
    | ((args: { context: TContext; event: TEvent }) => unknown)
    | Record<string, unknown>;
  onDone?: TransitionDefinition<TContext, TEvent>;
  onError?: TransitionDefinition<TContext, TEvent>;
}

/**
 * State node configuration
 */
export interface StateNodeConfig<TContext, TEvent extends EventObject> {
  /** Transitions from this state */
  on?: TransitionMap<TContext, TEvent>;
  /** Delayed transitions */
  after?: Record<string | number, TransitionDefinition<TContext, TEvent>>;
  /** Eventless transitions */
  always?: TransitionDefinition<TContext, TEvent>;
  /** Actions to execute on entry to this state */
  entry?: ActionDefinition<TContext, TEvent> | ActionDefinition<
    TContext,
    TEvent
  >[];
  /** Actions to execute on exit from this state */
  exit?: ActionDefinition<TContext, TEvent> | ActionDefinition<
    TContext,
    TEvent
  >[];
  /** Invoked actors */
  invoke?: InvokeConfig<TContext, TEvent> | InvokeConfig<TContext, TEvent>[];
  /** Metadata for this state */
  meta?: Record<string, unknown>;
  /** Tags for this state */
  tags?: string[];
  /** Type of state node: 'atomic' (default), 'compound' (has children), 'parallel', or 'history' */
  type?: "atomic" | "compound" | "parallel" | "history";
  /** History mode (for history states) */
  history?: "shallow" | "deep";
  /** Default target (for history states) */
  target?: string;
  /** Initial child state (for compound states) */
  initial?: string;
  /** Child states (for compound and parallel states) */
  states?: Record<string, StateNodeConfig<TContext, TEvent>>;
}

/**
 * Machine configuration
 */
export interface MachineConfig<TContext, TEvent extends EventObject> {
  /** Unique identifier for the machine */
  id?: string;
  /** Initial state */
  initial: string;
  /** Initial context */
  context?: TContext | (() => TContext);
  /** State definitions */
  states: Record<string, StateNodeConfig<TContext, TEvent>>;
  /** Global transitions (available in all states) */
  on?: TransitionMap<TContext, TEvent>;
}

/**
 * State value - can be string, object (for compound), or array (for parallel)
 */
export type StateValue = string | StateValueObject | StateValueArray;

interface StateValueObject {
  [key: string]: StateValue;
}

interface StateValueArray extends Array<StateValue> {}

/**
 * State snapshot representing the current state
 */
export interface StateSnapshot<TContext> {
  /** Current state value */
  value: StateValue;
  /** Current context */
  context: TContext;
  /** Check if the current state matches a given state value */
  matches(value: StateValue | string): boolean;
  /** Check if an event can be handled in the current state */
  can(event: EventObject): boolean;
}

/**
 * Subscription object returned by subscribe
 */
export interface Subscription {
  /** Unsubscribe from updates */
  unsubscribe(): void;
}

/**
 * Observer function for state changes
 */
export type Observer<TContext> = (state: StateSnapshot<TContext>) => void;

/**
 * Actor reference for interacting with a running machine
 */
export interface ActorRef<TContext, TEvent extends EventObject> {
  /** Start the actor */
  start(): ActorRef<TContext, TEvent>;
  /** Send an event to the actor */
  send(event: TEvent): void;
  /** Subscribe to state changes */
  subscribe(observer: Observer<TContext>): Subscription;
  /** Stop the actor */
  stop(): void;
  /** Get the current state snapshot */
  getSnapshot(): StateSnapshot<TContext>;
}

/**
 * Machine implementation
 */
export interface Machine<TContext, TEvent extends EventObject> {
  /** Machine configuration */
  config: MachineConfig<TContext, TEvent>;
  /** Initial state value */
  initialState: string;
  /** Resolved implementations */
  implementations?: MachineImplementations<TContext, TEvent>;
  /** Provide new implementations */
  provide(
    implementations: Partial<MachineImplementations<TContext, TEvent>>,
  ): Machine<TContext, TEvent>;
}

/**
 * Machine implementations (actions, guards, etc.)
 */
export interface MachineImplementations<TContext, TEvent extends EventObject> {
  /** Named actions */
  actions?: Record<string, ActionFunction<TContext, TEvent>>;
  /** Named guards */
  guards?: Record<string, GuardFunction<TContext, TEvent>>;
  /** Named delays */
  delays?: Record<string, DelayFunction<TContext, TEvent> | number>;
}

/**
 * Setup configuration
 */
export interface SetupConfig<TContext, TEvent extends EventObject> {
  /** Type definitions */
  types?: {
    context?: TContext;
    events?: TEvent;
  };
  /** Action implementations */
  actions?: Record<string, ActionFunction<TContext, TEvent>>;
  /** Guard implementations */
  guards?: Record<string, GuardFunction<TContext, TEvent>>;
  /** Delay implementations */
  delays?: Record<string, DelayFunction<TContext, TEvent> | number>;
}

/**
 * Setup return type
 */
export interface SetupReturn<TContext, TEvent extends EventObject> {
  /** Create a machine with the setup configuration */
  createMachine(
    config: MachineConfig<TContext, TEvent>,
  ): Machine<TContext, TEvent>;
}
