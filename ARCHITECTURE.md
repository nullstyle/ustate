# Architecture Documentation

This document describes the internal architecture of **ustate**.

## Design Philosophy

**ustate** is designed with the following principles:

1. **Simplicity First** - Focus on core state machine functionality without advanced features
2. **XState Compatibility** - Maintain API compatibility for common use cases
3. **Type Safety** - Leverage TypeScript for excellent developer experience
4. **Minimal Dependencies** - Only essential dependencies (`@nullstyle/urand` for high-quality PRNG)
5. **Readable Code** - Prioritize code clarity over clever optimizations

## Project Structure

```
ustate/
├── src/
│   ├── core/              # Core state machine implementation
│   │   ├── types.ts       # Type definitions
│   │   ├── machine.ts     # Machine creation
│   │   ├── actor.ts       # Actor implementation
│   │   ├── state.ts       # State snapshot
│   │   ├── transition.ts  # Transition logic
│   │   └── services.ts    # System services (ID generation, time)
│   ├── actions/           # Built-in actions
│   │   ├── assign.ts      # Context assignment
│   │   └── index.ts       # Action utilities
│   ├── actors/            # Actor logic implementations
│   │   └── logic.ts       # fromPromise, fromCallback
│   ├── setup.ts           # Setup function for v5 compatibility
│   ├── compat.ts          # Compatibility layer
│   ├── utils.ts           # Utility functions (waitFor)
│   ├── mermaid.ts         # Mermaid diagram generation
│   └── mod.ts             # Main entry point
├── tests/                 # Test files
├── examples/              # Example machines
├── deno.json              # Package configuration
└── README.md              # User documentation
```

## Core Components

### Types (`src/core/types.ts`)

Defines all TypeScript interfaces and types used throughout the library. Key types include:

- **EventObject** - Base type for all events
- **MachineConfig** - Configuration for creating machines
- **StateNodeConfig** - Configuration for individual states
- **TransitionConfig** - Configuration for transitions
- **Machine** - Machine instance type
- **ActorRef** - Actor instance type
- **StateSnapshot** - Immutable state representation

### Machine (`src/core/machine.ts`)

The `createMachine` function creates a machine definition from a configuration object. It:

1. Validates the configuration
2. Stores the initial state
3. Creates a machine object with a `provide` method for overriding implementations

Machines are **immutable** - calling `provide()` creates a new machine with updated implementations.

### Actor (`src/core/actor.ts`)

The `createActor` function creates a running instance of a machine. The actor:

1. Maintains current state and context
2. Manages a set of observers (subscribers)
3. Processes events and computes transitions
4. Executes actions at appropriate times
5. Notifies observers of state changes

**Key implementation details:**

- Context is deep-cloned on initialization to prevent mutations
- Context is copied before each transition to ensure immutability
- Entry actions are executed on `start()`
- Exit actions are executed on `stop()` and when leaving a state
- Observers are notified after each transition

### State (`src/core/state.ts`)

The `createStateSnapshot` function creates an immutable snapshot of the current state. State snapshots:

- Contain the current state value and context
- Provide `matches()` method to check the current state
- Provide `can()` method to check if an event can be handled

### Transition (`src/core/transition.ts`)

The transition module handles the core state machine logic:

1. **findTransition** - Finds a valid transition for an event
2. **evaluateGuard** - Checks guard conditions
3. **executeActions** - Executes action functions
4. **computeTransition** - Computes the next state given current state and event

**Transition algorithm:**

1. Find a matching transition in the current state
2. If not found, check global transitions
3. Evaluate guard condition (if present)
4. If guard passes:
   - Execute exit actions (if changing states)
   - Execute transition actions
   - Execute entry actions (if changing states)
5. Return new state and context

### Actions (`src/actions/`)

Built-in actions that can be used in machines:

- **assign** - Updates context immutably

The `assign` action is special - it mutates the context in place, but the context is already a copy created during the transition.

### Services (`src/core/services.ts`)

System services abstract non-deterministic operations for testability and deterministic replay:

- **generateId** - Generates unique IDs using `@nullstyle/urand` PRNG
- **now** - Returns current timestamp

Available service implementations:

- **defaultServices** - Production services using `@nullstyle/urand` for high-quality random ID generation
- **createDeterministicServices(seed)** - Seedable services for reproducible testing
- **createCounterServices(start)** - Simple counter-based IDs for predictable tests

Helper functions:

- **withServices(services, fn)** - Run code with temporary services
- **setServices/resetServices** - Global service management

### Setup (`src/setup.ts`)

The `setup` function provides a way to define type-safe implementations. It:

1. Accepts a configuration with types, actions, and guards
2. Returns an object with a `createMachine` method
3. The returned `createMachine` automatically includes the implementations

This pattern enables excellent TypeScript inference and IDE support.

### Compatibility (`src/compat.ts`)

The compatibility module helps users migrate from XState by:

1. Detecting unsupported features in machine configurations
2. Providing warnings with migration suggestions
3. Offering a `getCompatibilityInfo()` function to list supported/unsupported features

## Data Flow

### Machine Creation

```
User Config → createMachine() → Validation → Machine Object
```

### Actor Lifecycle

```
Machine → createActor() → Actor (stopped)
                              ↓
                          start()
                              ↓
                    Actor (running) ← send(event)
                              ↓
                          Transition
                              ↓
                    Notify Observers
```

### Event Processing

```
Event → Find Transition → Evaluate Guard → Execute Actions → New State
                              ↓                    ↓
                          (if fails)        Exit → Transition → Entry
                              ↓
                        No Transition
```

## Type Safety

**ustate** uses TypeScript generics extensively to provide type safety:

- **TContext** - Type of the machine's context
- **TEvent** - Union type of all possible events

The `setup()` function enables type inference, so users don't need to manually specify generic parameters in most cases.

## Performance Considerations

### Context Cloning

Context is cloned using `structuredClone()` which:
- ✅ Handles Dates, Maps, Sets, and circular references
- ✅ More performant for large objects
- ✅ Standard in modern environments

### Observer Pattern

The actor uses a `Set` to store observers, which provides:
- O(1) add/remove operations
- Efficient iteration
- Automatic deduplication

### Action Execution

Actions are resolved and executed synchronously. This is simpler than XState's action queue but means:
- Actions must be synchronous
- No action cancellation
- No action prioritization

## Limitations

### Synchronous Actions Only

Actions are executed synchronously, which means:
- No async/await in actions
- No promises
- Side effects must be fire-and-forget

**Workaround:** Use callbacks or external async coordination.

## Extension Points

The library can be extended in several ways:

### Custom Actions

Create custom actions by implementing the `ActionFunction` type:

```typescript
const myAction: ActionFunction<Context, Event> = ({ context, event }) => {
  // Your logic here
};
```

### Custom Guards

Create custom guards by implementing the `GuardFunction` type:

```typescript
const myGuard: GuardFunction<Context, Event> = ({ context, event }) => {
  return /* boolean condition */;
};
```

### Custom Setup

Create domain-specific setup functions:

```typescript
function mySetup() {
  return setup({
    actions: { /* predefined actions */ },
    guards: { /* predefined guards */ }
  });
}
```

## Testing Strategy

The test suite covers:

1. **Unit tests** - Individual functions and components
2. **Integration tests** - Complete machine lifecycles
3. **Type tests** - TypeScript type inference (implicit)

Tests use Deno's built-in test runner and assertions from `@std/assert`.

## Future Enhancements

Potential future additions (in order of priority):

1. **Event queue** - For `raise()` implementation
2. **Async actions** - Via callbacks or promises
3. **Visualization** - Generate state machine diagrams

## Comparison with XState

| Feature | XState | ustate |
|---------|--------|-------------|
| Flat states | ✅ | ✅ |
| Hierarchical states | ✅ | ✅ |
| Parallel states | ✅ | ✅ |
| History states | ✅ | ✅ |
| Context | ✅ | ✅ |
| Actions | ✅ | ✅ |
| Guards | ✅ | ✅ |
| Invoked actors | ✅ | ✅ |
| Spawned actors | ✅ | ✅ |
| Delayed transitions | ✅ | ✅ |
| Always transitions | ✅ | ✅ |
| SCXML compliance | ✅ | ❌ |
| Bundle size | ~50KB | ~10KB |
| Dependencies | Many | One (`@nullstyle/urand`) |

## Contributing

When contributing to **ustate**, please:

1. Maintain the simplicity principle
2. Add tests for new features
3. Update documentation
4. Ensure TypeScript types are correct
5. Follow the existing code style (enforced by `deno fmt`)

See the main README for contribution guidelines.
