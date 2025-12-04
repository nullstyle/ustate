# ustate

A JSR-native state machine library with full XState API compatibility.  *Yo, this library was completely vibe-coded*.  Don't use it without doing your due diligence.  This one is just for me.

**ustate** provides a complete implementation of state machines and statecharts with support for hierarchical states, parallel states, and actor systems, designed to be compatible with the XState API while focusing on simplicity and ease of use. It is published to JSR (JavaScript Registry) and works seamlessly with Deno, Node.js, and browsers.

## Features

- **XState-compatible API** - Familiar API for XState users
- **Hierarchical States** - Full support for nested state machines
- **Parallel States** - Run multiple state regions simultaneously
- **Invoked Actors** - Promise and callback actors with lifecycle management
- **Spawned Actors** - Dynamic actor creation and management
- **TypeScript-first** - Full type safety and excellent IDE support
- **Minimal dependencies** - Only depends on `@nullstyle/urand` for high-quality PRNG
- **ESM-only** - Modern JavaScript modules
- **Cross-runtime** - Works in Deno, Node.js, and browsers
- **Well-tested** - Comprehensive test suite with 197 passing tests

## Installation

### Deno

```typescript
import { createMachine, createActor, assign } from 'jsr:@nullstyle/ustate';
```

### Node.js

```bash
npx jsr add @nullstyle/ustate
```

```typescript
import { createMachine, createActor, assign } from '@nullstyle/ustate';
```

### Browsers

```typescript
import { createMachine, createActor, assign } from 'https://esm.sh/jsr/@nullstyle/ustate';
```

## Quick Start

### Simple Toggle Machine

```typescript
import { createMachine, createActor } from 'jsr:@nullstyle/ustate';

const toggleMachine = createMachine({
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

const actor = createActor(toggleMachine);
actor.subscribe((state) => console.log('State:', state.value));
actor.start();
actor.send({ type: 'TOGGLE' });
```

### Context and Actions

```typescript
import { createMachine, createActor, assign } from 'jsr:@nullstyle/ustate';

const counterMachine = createMachine({
  initial: 'active',
  context: { count: 0 },
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

### Hierarchical States

```typescript
const trafficLightMachine = createMachine({
  id: 'trafficLight',
  initial: 'green',
  states: {
    green: {
      on: {
        TIMER: { target: 'yellow' },
        PEDESTRIAN: { target: 'pedestrianCrossing' }
      }
    },
    yellow: {
      on: { TIMER: { target: 'red' } }
    },
    red: {
      on: { TIMER: { target: 'green' } }
    },
    pedestrianCrossing: {
      initial: 'stopping',
      states: {
        stopping: { on: { TIMER: { target: 'walking' } } },
        walking: { on: { TIMER: { target: 'flashing' } } },
        flashing: { on: { TIMER: { target: 'complete' } } },
        complete: { on: { TIMER: { target: 'green' } } }
      }
    }
  }
});
```

### Parallel States

```typescript
const mediaPlayerMachine = createMachine({
  id: 'mediaPlayer',
  initial: 'active',
  states: {
    active: {
      type: 'parallel',
      states: {
        playback: {
          initial: 'stopped',
          states: {
            stopped: { on: { PLAY: { target: 'playing' } } },
            playing: {
              on: {
                PAUSE: { target: 'paused' },
                STOP: { target: 'stopped' }
              }
            },
            paused: {
              on: {
                PLAY: { target: 'playing' },
                STOP: { target: 'stopped' }
              }
            }
          }
        },
        volume: {
          initial: 'normal',
          states: {
            normal: { on: { MUTE: { target: 'muted' } } },
            muted: { on: { UNMUTE: { target: 'normal' } } }
          }
        }
      }
    }
  }
});
```

### Invoked Actors - Promise

```typescript
import { createMachine, createActor, assign, fromPromise } from 'jsr:@nullstyle/ustate';

const fetchMachine = createMachine({
  initial: 'idle',
  context: { data: null, error: null },
  states: {
    idle: {
      on: { FETCH: { target: 'loading' } }
    },
    loading: {
      invoke: {
        id: 'fetchData',
        src: fromPromise(async () => {
          const response = await fetch('https://api.example.com/data');
          return response.json();
        }),
        onDone: {
          target: 'success',
          actions: assign({
            data: ({ event }) => 'output' in event ? event.output : null
          })
        },
        onError: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => 'error' in event ? event.error : null
          })
        }
      }
    },
    success: {},
    failure: {
      on: { RETRY: { target: 'loading' } }
    }
  }
});
```

### Invoked Actors - Callback

```typescript
import { createMachine, createActor, assign, fromCallback } from 'jsr:@nullstyle/ustate';

const timerMachine = createMachine({
  initial: 'idle',
  context: { count: 0 },
  states: {
    idle: {
      on: { START: { target: 'running' } }
    },
    running: {
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
          actions: assign({
            count: ({ context }) => context.count + 1
          })
        },
        STOP: { target: 'idle' }
      }
    }
  }
});
```

## Supported Features

### Core Features
- ✅ Flat state machines
- ✅ Hierarchical (nested) states
- ✅ Parallel states
- ✅ Event-driven transitions
- ✅ Context management with `assign()`
- ✅ Entry and exit actions
- ✅ Transition actions
- ✅ Guards (conditional transitions)

### Actor System
- ✅ Invoked actors (promise-based)
- ✅ Invoked actors (callback-based)
- ✅ Spawned actors (basic support)
- ✅ Actor lifecycle management
- ✅ `onDone` and `onError` transitions

### Type Safety
- ✅ `setup()` function for type-safe machines
- ✅ `machine.provide()` for implementation overrides
- ✅ `state.matches()` for state checking
- ✅ `state.can()` for event capability checking

## Examples

- [counter.ts](./examples/counter.ts) - Basic counter with context
- [toggle.ts](./examples/toggle.ts) - Simple toggle with entry/exit actions
- [text-editor.ts](./examples/text-editor.ts) - Text editor with guards
- [traffic-light.ts](./examples/traffic-light.ts) - Hierarchical states
- [media-player.ts](./examples/media-player.ts) - Parallel states
- [fetch-data.ts](./examples/fetch-data.ts) - Promise actors for API calls
- [timer.ts](./examples/timer.ts) - Callback actors for intervals

## API Reference

### Core Functions

- **`createMachine(config)`** - Create a state machine
- **`createActor(machine)`** - Create an actor from a machine
- **`assign(assigner)`** - Create context update action
- **`setup(config)`** - Create type-safe machine builder

### Actor Logic

- **`fromPromise(fn)`** - Create promise-based actor logic
- **`fromCallback(fn)`** - Create callback-based actor logic

### Utilities

- **`waitFor(actor, predicate, options?)`** - Wait for actor to reach a state matching predicate
- **`toMermaid(machine)`** - Generate Mermaid diagram from machine

### System Services (for testing)

- **`createDeterministicServices(seed?)`** - Create seedable services for reproducible tests
- **`createCounterServices(start?)`** - Create counter-based services for predictable IDs
- **`withServices(services, fn)`** - Run function with temporary services
- **`setServices(services)`** - Set global services instance
- **`resetServices()`** - Reset to default services

### Actor Methods

- **`actor.start()`** - Start the actor
- **`actor.send(event)`** - Send an event to the actor
- **`actor.subscribe(observer)`** - Subscribe to state changes
- **`actor.stop()`** - Stop the actor and cleanup
- **`actor.getSnapshot()`** - Get current state snapshot

### State Snapshot

- **`state.value`** - Current state value (string or object)
- **`state.context`** - Current context
- **`state.matches(value)`** - Check if state matches a value
- **`state.can(event)`** - Check if event can be handled

## Testing Support

ustate provides deterministic services for reproducible testing:

```typescript
import { createDeterministicServices, withServices, createActor } from 'jsr:@nullstyle/ustate';

// Run tests with deterministic ID generation
const result = withServices(createDeterministicServices(12345), () => {
  const actor = createActor(machine);
  actor.start();
  // IDs will be reproducible with the same seed
  return actor.getSnapshot();
});
```

## Visualization

Generate Mermaid diagrams from your state machines:

```typescript
import { createMachine, toMermaid } from 'jsr:@nullstyle/ustate';

const machine = createMachine({
  id: 'toggle',
  initial: 'inactive',
  states: {
    inactive: { on: { TOGGLE: { target: 'active' } } },
    active: { on: { TOGGLE: { target: 'inactive' } } }
  }
});

console.log(toMermaid(machine));
// Outputs Mermaid stateDiagram-v2 syntax
```

## Documentation

- [Migration Guide](./MIGRATION.md) - Migrating from XState
- [Architecture](./ARCHITECTURE.md) - Internal design and implementation
- [Publishing Guide](./PUBLISHING.md) - How to publish to JSR
- [Actor System Design](./ACTOR_SYSTEM_DESIGN.md) - Actor system architecture

## License

MIT

## Acknowledgments

Inspired by [XState](https://github.com/statelyai/xstate) by David Khourshid and the Stately team.

## On the use of AI

This library was primarily developed using the latest batch of AI vibe coding tools I (nullstyle) have been playing with.  As part of that, I'm allowing each agentic tool to provide a paragraph of text that let's it represent its contributions to the work.

### Manus, the initial worker said:

This library was developed with significant contributions from AI assistants:
Claude (Anthropic) designed and implemented the core architecture of ustate, including:
Complete state machine engine with hierarchical and parallel state support
Lowest Common Ancestor (LCA) algorithm for efficient state transitions
Deep state value merging for parallel states
Actor system with invoked actors (promise and callback-based)
Comprehensive test suite and working examples
Initial documentation and API design
The implementation focused on XState API compatibility while maintaining simplicity and minimal dependencies, resulting in a production-ready state machine library suitable for real-world applications.

### Zed, by way of Gemini 3 Pro said:

Gemini 3 Pro architected and implemented the advanced statechart capabilities of `ustate`, including Delayed Transitions (`after`), History States, and Transient Transitions (`always`). It also stabilized the core actor runtime, resolving critical issues with parallel state management, context integrity, and cross-actor communication.
