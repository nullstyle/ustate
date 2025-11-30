# Actor System Design

## Overview

This document outlines the design for adding invoked and spawned actors to ustate, enabling hierarchical actor systems and dynamic actor management.

## Key Concepts

### Invoked Actors
- **Lifecycle**: Tied to parent state - started on entry, stopped on exit
- **Declaration**: Defined in state config via `invoke` property
- **Use case**: Long-running services, background tasks
- **Communication**: Parent can send events to invoked actors, actors can send events back

### Spawned Actors
- **Lifecycle**: Independent - created dynamically, persist until explicitly stopped
- **Creation**: Created via `spawn()` action
- **Use case**: Dynamic actor creation (e.g., one actor per item in a list)
- **Communication**: Bidirectional event sending

## Architecture

### Actor Reference (ActorRef)
```typescript
interface ActorRef<TEvent extends EventObject> {
  id: string;
  send: (event: TEvent) => void;
  stop: () => void;
  getSnapshot: () => StateSnapshot<any, TEvent>;
  subscribe: (observer: Observer<StateSnapshot<any, TEvent>>) => Subscription;
}
```

### Invoked Actor Configuration
```typescript
interface InvokeConfig<TContext, TEvent> {
  id?: string;
  src: ActorLogic<any, any> | string;
  input?: (context: TContext, event: TEvent) => any;
  onDone?: TransitionConfig<TContext, TEvent>;
  onError?: TransitionConfig<TContext, TEvent>;
}
```

### Actor Logic
```typescript
type ActorLogic<TContext, TEvent> = 
  | Machine<TContext, TEvent>
  | PromiseLogic<TContext, TEvent>
  | CallbackLogic<TContext, TEvent>
  | ObservableLogic<TContext, TEvent>;
```

## Implementation Plan

### Phase 1: Core Actor System
1. Update `ActorRef` interface to be reusable
2. Create `ActorSystem` class to manage child actors
3. Add actor registry for tracking spawned/invoked actors
4. Implement parent-child communication

### Phase 2: Invoked Actors
1. Add `invoke` property to state config
2. Implement invoke lifecycle (start on entry, stop on exit)
3. Handle `onDone` and `onError` transitions
4. Support multiple invocations per state

### Phase 3: Spawned Actors
1. Implement `spawn()` action
2. Add spawned actor tracking in context
3. Support dynamic actor creation
4. Implement cleanup on parent stop

### Phase 4: Actor Communication
1. Implement `sendTo()` action for sending to specific actors
2. Implement `sendParent()` for child-to-parent communication
3. Add callback support for invoked actors
4. Handle actor completion events

## API Design

### Invoked Actors
```typescript
const machine = createMachine({
  initial: 'active',
  states: {
    active: {
      invoke: {
        id: 'childActor',
        src: childMachine,
        input: ({ context }) => ({ value: context.value }),
        onDone: {
          target: 'success',
          actions: assign({ result: ({ event }) => event.output })
        },
        onError: {
          target: 'failure'
        }
      }
    },
    success: {},
    failure: {}
  }
});
```

### Spawned Actors
```typescript
const machine = setup({
  actions: {
    spawnChild: assign({
      childRef: ({ spawn }) => spawn(childMachine, { id: 'child-1' })
    }),
    sendToChild: sendTo('child-1', { type: 'PING' })
  }
}).createMachine({
  initial: 'idle',
  context: { childRef: null },
  states: {
    idle: {
      on: {
        SPAWN: {
          actions: 'spawnChild'
        }
      }
    }
  }
});
```

### Promise Actors
```typescript
const machine = createMachine({
  initial: 'loading',
  states: {
    loading: {
      invoke: {
        src: fromPromise(async ({ input }) => {
          const response = await fetch(input.url);
          return response.json();
        }),
        input: { url: 'https://api.example.com/data' },
        onDone: {
          target: 'success',
          actions: assign({ data: ({ event }) => event.output })
        },
        onError: {
          target: 'failure'
        }
      }
    },
    success: {},
    failure: {}
  }
});
```

### Callback Actors
```typescript
const machine = createMachine({
  initial: 'listening',
  states: {
    listening: {
      invoke: {
        src: fromCallback(({ sendBack, receive }) => {
          const interval = setInterval(() => {
            sendBack({ type: 'TICK', timestamp: Date.now() });
          }, 1000);
          
          receive((event) => {
            if (event.type === 'STOP') {
              clearInterval(interval);
            }
          });
          
          return () => clearInterval(interval);
        })
      },
      on: {
        TICK: {
          actions: ({ event }) => console.log('Tick:', event.timestamp)
        }
      }
    }
  }
});
```

## Type Safety

All actor operations will maintain full type safety:
- Input types flow from parent to child
- Output types flow from child to parent
- Event types are properly constrained
- Context updates are type-checked

## Cleanup Strategy

1. **Invoked actors**: Automatically stopped when parent exits the invoking state
2. **Spawned actors**: Stopped when parent actor stops (unless explicitly stopped earlier)
3. **Promise actors**: Cancellable via AbortController
4. **Callback actors**: Cleanup function called on stop

## Testing Strategy

1. Unit tests for actor lifecycle
2. Integration tests for parent-child communication
3. Tests for cleanup and memory management
4. Tests for error handling
5. Tests for multiple invocations
6. Tests for spawned actor tracking

## Examples to Create

1. **fetch-data.ts** - Promise actor for API calls
2. **timer.ts** - Callback actor for intervals
3. **chat-room.ts** - Spawned actors for multiple users
4. **workflow.ts** - Invoked actors for multi-step processes
5. **game.ts** - Spawned actors for game entities
