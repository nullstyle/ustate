# Migration Guide: XState to ustate

This guide helps you migrate from XState to **ustate**.

## Quick Start

If your XState machine uses only basic features, migration is straightforward:

```typescript
// Before (XState)
import { createMachine, createActor, assign } from 'xstate';

// After (ustate)
import { createMachine, createActor, assign } from 'jsr:@nullstyle/ustate';
```

The API is compatible for common use cases, so your code should work with minimal changes.

## Compatibility Checker

Use the compatibility module to check if your machine uses unsupported features:

```typescript
import { createMachine } from 'jsr:@nullstyle/ustate/compat';

const machine = createMachine({
  // Your XState machine config
});
// Will log warnings if unsupported features are detected
```

## Supported Features

These XState features work in ustate without changes:

### ✅ Basic State Machines

```typescript
const machine = createMachine({
  id: 'toggle',
  initial: 'inactive',
  states: {
    inactive: {
      on: { TOGGLE: { target: 'active' } }
    },
    active: {
      on: { TOGGLE: { target: 'inactive' } }
    }
  }
});
```

### ✅ Context and Assign

```typescript
const machine = createMachine({
  context: { count: 0 },
  initial: 'active',
  states: {
    active: {
      on: {
        INC: {
          actions: assign({
            count: ({ context }) => context.count + 1
          })
        }
      }
    }
  }
});
```

### ✅ Entry and Exit Actions

```typescript
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      entry: () => console.log('Entering idle'),
      exit: () => console.log('Exiting idle'),
      on: { START: { target: 'active' } }
    },
    active: {}
  }
});
```

### ✅ Guards

```typescript
const machine = createMachine({
  context: { count: 0 },
  initial: 'active',
  states: {
    active: {
      on: {
        INC: {
          guard: ({ context }) => context.count < 10,
          actions: assign({ count: ({ context }) => context.count + 1 })
        }
      }
    }
  }
});
```

### ✅ Setup Function

```typescript
const machineSetup = setup({
  types: {
    context: {} as { count: number },
    events: {} as { type: 'INC' } | { type: 'DEC' }
  },
  actions: {
    logCount: ({ context }) => console.log(context.count)
  },
  guards: {
    canIncrement: ({ context }) => context.count < 10
  }
});

const machine = machineSetup.createMachine({
  // Machine config
});
```

### ✅ Provide Method

```typescript
const customMachine = machine.provide({
  actions: {
    myAction: () => console.log('Custom implementation')
  }
});
```

### ✅ Hierarchical (Nested) States

```typescript
const machine = createMachine({
  initial: 'parent',
  states: {
    parent: {
      initial: 'child1',
      states: {
        child1: { on: { NEXT: 'child2' } },
        child2: {}
      }
    }
  }
});
```

### ✅ Parallel States

```typescript
const machine = createMachine({
  type: 'parallel',
  states: {
    upload: { /* ... */ },
    download: { /* ... */ }
  }
});
```

### ✅ Invoked Actors

```typescript
import { fromPromise } from 'jsr:@nullstyle/ustate';

const machine = createMachine({
  initial: 'active',
  states: {
    active: {
      invoke: {
        src: fromPromise(async () => {
          return await fetchData();
        }),
        onDone: { target: 'done' }
      }
    },
    done: {}
  }
});
```

### ✅ Spawn

```typescript
import { createMachine, createActor, assign } from 'jsr:@nullstyle/ustate';

const childMachine = createMachine({
  id: 'child',
  initial: 'active',
  states: { active: {} }
});

const machine = createMachine({
  context: { actors: [] },
  initial: 'active',
  states: {
    active: {
      on: {
        SPAWN: {
          actions: assign({
            actors: ({ context, spawn }) => [
              ...context.actors,
              spawn(childMachine)
            ]
          })
        }
      }
    }
  }
});
```

### ✅ Delayed Transitions (after)

```typescript
const machine = createMachine({
  initial: 'waiting',
  states: {
    waiting: {
      after: {
        1000: { target: 'done' }
      }
    },
    done: {}
  }
});
```

### ✅ History States

```typescript
const machine = createMachine({
  initial: 'parent',
  states: {
    parent: {
      initial: 'child1',
      states: {
        child1: {},
        child2: {},
        hist: { type: 'history' }
      }
    }
  }
});
```

### ✅ Always Transitions

```typescript
const machine = createMachine({
  initial: 'checking',
  context: { value: 0 },
  states: {
    checking: {
      always: [
        { target: 'positive', guard: ({ context }) => context.value > 0 },
        { target: 'negative', guard: ({ context }) => context.value < 0 },
        { target: 'zero' }
      ]
    },
    positive: {},
    negative: {},
    zero: {}
  }
});
```

## Unsupported Features

These XState features are **not supported** in ustate:

- **raise()**: Events are processed synchronously, so there is no internal event queue.
- **Async Actions**: Actions must be synchronous. Use invoked actors for async logic.
- **SCXML Compliance**: Full SCXML compatibility is not a goal.

## API Differences

### Actor Methods

Most actor methods are the same, but there are some differences:

| XState | ustate | Notes |
|--------|-------------|-------|
| `actor.start()` | `actor.start()` | ✅ Same |
| `actor.send(event)` | `actor.send(event)` | ✅ Same |
| `actor.subscribe(fn)` | `actor.subscribe(fn)` | ✅ Same |
| `actor.stop()` | `actor.stop()` | ✅ Same |
| `actor.getSnapshot()` | `actor.getSnapshot()` | ✅ Same |
| `actor.system` | ❌ Not available | Use external coordination |
| `actor.sessionId` | ❌ Not available | Track externally if needed |

### State Methods

| XState | ustate | Notes |
|--------|-------------|-------|
| `state.value` | `state.value` | ✅ Same (string only) |
| `state.context` | `state.context` | ✅ Same |
| `state.matches(value)` | `state.matches(value)` | ✅ Same |
| `state.can(event)` | `state.can(event)` | ✅ Same |
| `state.hasTag(tag)` | ❌ Not available | Track tags in context |
| `state.getMeta()` | ❌ Not available | Use context instead |

## Type Definitions

ustate uses similar type definitions to XState v5:

```typescript
// Both work the same way
type Context = { count: number };
type Events = { type: 'INC' } | { type: 'DEC' };

const machine = createMachine<Context, Events>({
  // ...
});
```

Or use the `setup()` function for better inference:

```typescript
const machineSetup = setup({
  types: {
    context: {} as Context,
    events: {} as Events
  }
});
```

## Testing

Tests should work the same way:

```typescript
// XState and ustate
const actor = createActor(machine);
actor.start();

actor.send({ type: 'EVENT' });
const state = actor.getSnapshot();

expect(state.value).toBe('expectedState');
expect(state.context.count).toBe(1);
```

## React Integration

ustate doesn't provide React hooks, but you can create your own:

```typescript
import { useEffect, useState } from 'react';
import { createActor } from 'jsr:@nullstyle/ustate';

function useMachine(machine) {
  const [actor] = useState(() => createActor(machine));
  const [state, setState] = useState(() => actor.getSnapshot());

  useEffect(() => {
    const subscription = actor.subscribe(setState);
    actor.start();
    return () => {
      subscription.unsubscribe();
      actor.stop();
    };
  }, [actor]);

  return [state, actor.send.bind(actor)];
}
```

## Performance

ustate is generally faster for simple machines because it has less overhead:

- Smaller bundle size (~10KB vs ~50KB)
- Simpler transition algorithm
- No actor system overhead

However, XState may be faster for complex machines with many states due to optimizations.

## When to Use ustate

Use **ustate** when:
- ✅ You have simple state machines
- ✅ You want a smaller bundle size
- ✅ You don't need advanced features
- ✅ You're publishing to JSR
- ✅ You want minimal dependencies (only `@nullstyle/urand`)

Use **XState** when:
- ✅ You need SCXML compliance
- ✅ You need the ecosystem (React hooks, Vue composables, etc.)

## Getting Help

If you're stuck migrating:

1. Check the [examples](./examples/) directory
2. Use the [compatibility checker](./src/compat.ts)
3. Read the [architecture docs](./ARCHITECTURE.md)
4. Open an issue on GitHub

## Gradual Migration

You can use both libraries in the same project:

```typescript
// Use XState for complex machines
import { createMachine as createXStateMachine } from 'xstate';

// Use ustate for simple machines
import { createMachine } from 'jsr:@nullstyle/ustate';

const complexMachine = createXStateMachine({ /* ... */ });
const simpleMachine = createMachine({ /* ... */ });
```

This allows you to migrate incrementally.
