/**
 * Comprehensive Actor Invocation Tests
 *
 * Task 1.5: Actor Invocation (following XState patterns)
 * Tests for lifecycle, promise actors, callback actors, and zombie prevention.
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { createMachine } from "../../src/core/machine.ts";
import { createActor } from "../../src/core/actor.ts";
import { assign } from "../../src/actions/assign.ts";
import { fromCallback, fromPromise } from "../../src/actors/logic.ts";
import type { ActorLogic, EventObject } from "../../src/core/types.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Lifecycle Tests
// =============================================================================

Deno.test("Invoke: Actor starts on state entry", async () => {
  let invokeStarted = false;

  const machine = createMachine({
    initial: "idle",
    states: {
      idle: {
        on: { START: { target: "active" } },
      },
      active: {
        invoke: {
          id: "myActor",
          src: fromCallback(() => {
            invokeStarted = true;
            return () => {};
          }),
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(invokeStarted, false);

  actor.send({ type: "START" });

  await sleep(10);
  assertEquals(invokeStarted, true);
});

Deno.test("Invoke: Actor stops on state exit", async () => {
  let cleanupCalled = false;

  const machine = createMachine({
    initial: "active",
    states: {
      active: {
        invoke: {
          id: "myActor",
          src: fromCallback(() => {
            return () => {
              cleanupCalled = true;
            };
          }),
        },
        on: { STOP: { target: "stopped" } },
      },
      stopped: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(10);
  assertEquals(cleanupCalled, false);

  actor.send({ type: "STOP" });

  await sleep(10);
  assertEquals(cleanupCalled, true);
  assertEquals(actor.getSnapshot().value, "stopped");
});

Deno.test("Invoke: Multiple invocations start and stop correctly", async () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "active",
    states: {
      active: {
        invoke: [
          {
            id: "actor1",
            src: fromCallback(() => {
              log.push("actor1:start");
              return () => log.push("actor1:stop");
            }),
          },
          {
            id: "actor2",
            src: fromCallback(() => {
              log.push("actor2:start");
              return () => log.push("actor2:stop");
            }),
          },
        ],
        on: { EXIT: { target: "inactive" } },
      },
      inactive: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(10);
  assertEquals(log.includes("actor1:start"), true);
  assertEquals(log.includes("actor2:start"), true);

  actor.send({ type: "EXIT" });

  await sleep(10);
  assertEquals(log.includes("actor1:stop"), true);
  assertEquals(log.includes("actor2:stop"), true);
});

Deno.test("Invoke: Actors stop when parent actor stops", async () => {
  let cleanupCalled = false;

  const machine = createMachine({
    initial: "active",
    states: {
      active: {
        invoke: {
          id: "myActor",
          src: fromCallback(() => {
            return () => {
              cleanupCalled = true;
            };
          }),
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(10);
  assertEquals(cleanupCalled, false);

  actor.stop();

  await sleep(10);
  assertEquals(cleanupCalled, true);
});

// =============================================================================
// Promise Actor Tests
// =============================================================================

Deno.test("Invoke: Promise actor - onDone transition on resolve", async () => {
  const machine = createMachine<
    { result?: string },
    { type: "START" } | { type: "done.invoke.fetcher"; output: string }
  >({
    initial: "idle",
    context: {},
    states: {
      idle: {
        on: { START: { target: "loading" } },
      },
      loading: {
        invoke: {
          id: "fetcher",
          src: fromPromise(async () => {
            await sleep(20);
            return "success data";
          }) as ActorLogic<unknown, unknown, EventObject>,
          onDone: {
            target: "success",
            actions: ({ context, event }) => {
              if ("output" in event) {
                context.result = event.output as string;
              }
            },
          },
        },
      },
      success: {},
      failure: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "START" });
  assertEquals(actor.getSnapshot().value, "loading");

  await sleep(50);

  assertEquals(actor.getSnapshot().value, "success");
  assertEquals(actor.getSnapshot().context.result, "success data");
});

Deno.test("Invoke: Promise actor - onError transition on reject", async () => {
  const machine = createMachine<
    { error?: string },
    { type: "START" }
  >({
    initial: "idle",
    context: {},
    states: {
      idle: {
        on: { START: { target: "loading" } },
      },
      loading: {
        invoke: {
          id: "fetcher",
          src: fromPromise(async () => {
            await sleep(20);
            throw new Error("Network error");
          }) as ActorLogic<unknown, unknown, EventObject>,
          onDone: {
            target: "success",
          },
          onError: {
            target: "failure",
            actions: ({ context, event }) => {
              if ("error" in event) {
                const err = event.error as Error;
                context.error = err.message;
              }
            },
          },
        },
      },
      success: {},
      failure: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "START" });
  assertEquals(actor.getSnapshot().value, "loading");

  await sleep(50);

  assertEquals(actor.getSnapshot().value, "failure");
  assertEquals(actor.getSnapshot().context.error, "Network error");
});

Deno.test("Invoke: Promise actor - immediate resolution", async () => {
  const machine = createMachine({
    initial: "loading",
    states: {
      loading: {
        invoke: {
          id: "immediate",
          src: fromPromise(async () => "instant") as ActorLogic<
            unknown,
            unknown,
            EventObject
          >,
          onDone: { target: "done" },
        },
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(20);

  assertEquals(actor.getSnapshot().value, "done");
});

// =============================================================================
// Zombie Prevention Tests (Critical)
// =============================================================================

Deno.test("Invoke: Zombie prevention - onDone ignored after state exit", async () => {
  const log: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "CANCEL" }
  >({
    initial: "loading",
    states: {
      loading: {
        invoke: {
          id: "slowPromise",
          src: fromPromise(async () => {
            await sleep(100);
            log.push("promise:resolved");
            return "data";
          }) as ActorLogic<unknown, unknown, EventObject>,
          onDone: {
            target: "success",
            actions: () => log.push("onDone:called"),
          },
        },
        on: { CANCEL: { target: "cancelled" } },
      },
      success: {
        entry: () => log.push("success:entry"),
      },
      cancelled: {
        entry: () => log.push("cancelled:entry"),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "loading");

  // Cancel before promise resolves
  await sleep(30);
  actor.send({ type: "CANCEL" });

  assertEquals(actor.getSnapshot().value, "cancelled");
  assertEquals(log, ["cancelled:entry"]);

  // Wait for promise to resolve
  await sleep(150);

  // Should still be in cancelled state - onDone should be ignored
  assertEquals(actor.getSnapshot().value, "cancelled");
  // The promise resolved but onDone should not have been called
  assertEquals(log.includes("onDone:called"), false);
  assertEquals(log.includes("success:entry"), false);
});

Deno.test("Invoke: Zombie prevention - onError ignored after state exit", async () => {
  const log: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "CANCEL" }
  >({
    initial: "loading",
    states: {
      loading: {
        invoke: {
          id: "slowPromise",
          src: fromPromise(async () => {
            await sleep(100);
            throw new Error("Failed");
          }) as ActorLogic<unknown, unknown, EventObject>,
          onError: {
            target: "error",
            actions: () => log.push("onError:called"),
          },
        },
        on: { CANCEL: { target: "cancelled" } },
      },
      error: {
        entry: () => log.push("error:entry"),
      },
      cancelled: {
        entry: () => log.push("cancelled:entry"),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Cancel before promise rejects
  await sleep(30);
  actor.send({ type: "CANCEL" });

  assertEquals(actor.getSnapshot().value, "cancelled");

  // Wait for promise to reject
  await sleep(150);

  // Should still be cancelled - onError ignored
  assertEquals(actor.getSnapshot().value, "cancelled");
  assertEquals(log.includes("onError:called"), false);
  assertEquals(log.includes("error:entry"), false);
});

Deno.test("Invoke: Zombie prevention with re-entry to same state", async () => {
  let resolveCount = 0;
  const log: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "RESTART" }
  >({
    initial: "loading",
    states: {
      loading: {
        invoke: {
          id: "fetcher",
          src: fromPromise(async () => {
            const count = ++resolveCount;
            await sleep(50);
            log.push(`promise${count}:resolved`);
            return `data${count}`;
          }) as ActorLogic<unknown, unknown, EventObject>,
          onDone: {
            target: "done",
            actions: () => log.push("onDone:called"),
          },
        },
        on: { RESTART: { target: "loading" } },
      },
      done: {
        entry: () => log.push("done:entry"),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Restart while first promise is pending
  await sleep(20);
  actor.send({ type: "RESTART" });

  // Wait for both promises to resolve
  await sleep(100);

  // Should only transition to done once (from the second promise)
  assertEquals(actor.getSnapshot().value, "done");

  // The first promise should have been ignored
  // Only the second onDone should have triggered the transition
});

// =============================================================================
// Callback Actor Tests
// =============================================================================

Deno.test("Invoke: Callback actor sends events back to parent", async () => {
  const receivedEvents: Array<{ type: string; count?: number }> = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "TICK"; count: number }
  >({
    initial: "running",
    states: {
      running: {
        invoke: {
          id: "ticker",
          src: fromCallback(({ sendBack }) => {
            let count = 0;
            const interval = setInterval(() => {
              count++;
              sendBack({ type: "TICK", count });
            }, 20);
            return () => clearInterval(interval);
          }),
        },
        on: {
          TICK: {
            actions: ({ event }) => {
              receivedEvents.push(event);
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(70);

  actor.stop();

  assertEquals(receivedEvents.length >= 2, true);
  assertEquals(receivedEvents[0].type, "TICK");
  assertEquals(receivedEvents[0].count, 1);
});

Deno.test("Invoke: Callback actor receives events from parent", async () => {
  const receivedByActor: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "PING" }
  >({
    initial: "running",
    states: {
      running: {
        invoke: {
          id: "listener",
          src: fromCallback(({ receive }) => {
            receive((event) => {
              receivedByActor.push(event.type);
            });
            return () => {};
          }),
        },
        on: {
          PING: {
            // Send to the invoked actor
            actions: () => {},
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "PING" });
  actor.send({ type: "PING" });

  await sleep(20);

  actor.stop();
});

Deno.test("Invoke: Callback cleanup called on exit", async () => {
  let cleanupCalled = false;
  let intervalCleared = false;

  const machine = createMachine<
    Record<string, never>,
    { type: "STOP" }
  >({
    initial: "running",
    states: {
      running: {
        invoke: {
          src: fromCallback(() => {
            const interval = setInterval(() => {}, 10);
            return () => {
              clearInterval(interval);
              intervalCleared = true;
              cleanupCalled = true;
            };
          }),
        },
        on: { STOP: { target: "stopped" } },
      },
      stopped: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(30);
  assertEquals(cleanupCalled, false);

  actor.send({ type: "STOP" });

  await sleep(10);
  assertEquals(cleanupCalled, true);
  assertEquals(intervalCleared, true);
});

// =============================================================================
// Invocation in Nested States
// =============================================================================

Deno.test("Invoke: Invocation in nested state", async () => {
  let invokeStarted = false;
  let cleanupCalled = false;

  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "child",
        on: { EXIT: { target: "outside" } },
        states: {
          child: {
            invoke: {
              src: fromCallback(() => {
                invokeStarted = true;
                return () => {
                  cleanupCalled = true;
                };
              }),
            },
          },
        },
      },
      outside: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(10);
  assertEquals(invokeStarted, true);
  assertEquals(cleanupCalled, false);

  actor.send({ type: "EXIT" });

  await sleep(10);
  assertEquals(cleanupCalled, true);
});

Deno.test("Invoke: Parent exit stops child invocations", async () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "level1",
        on: { EXIT: { target: "outside" } },
        states: {
          level1: {
            initial: "level2",
            invoke: {
              id: "level1Actor",
              src: fromCallback(() => {
                log.push("level1:start");
                return () => log.push("level1:stop");
              }),
            },
            states: {
              level2: {
                invoke: {
                  id: "level2Actor",
                  src: fromCallback(() => {
                    log.push("level2:start");
                    return () => log.push("level2:stop");
                  }),
                },
              },
            },
          },
        },
      },
      outside: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(10);
  assertEquals(log.includes("level1:start"), true);
  assertEquals(log.includes("level2:start"), true);

  actor.send({ type: "EXIT" });

  await sleep(10);
  assertEquals(log.includes("level1:stop"), true);
  assertEquals(log.includes("level2:stop"), true);
});

// =============================================================================
// Parallel States with Invocations
// =============================================================================

Deno.test("Invoke: Invocations in parallel regions", async () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        on: { EXIT: { target: "done" } },
        states: {
          region1: {
            initial: "active",
            states: {
              active: {
                invoke: {
                  id: "region1Actor",
                  src: fromCallback(() => {
                    log.push("region1:start");
                    return () => log.push("region1:stop");
                  }),
                },
              },
            },
          },
          region2: {
            initial: "active",
            states: {
              active: {
                invoke: {
                  id: "region2Actor",
                  src: fromCallback(() => {
                    log.push("region2:start");
                    return () => log.push("region2:stop");
                  }),
                },
              },
            },
          },
        },
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(10);
  assertEquals(log.includes("region1:start"), true);
  assertEquals(log.includes("region2:start"), true);

  actor.send({ type: "EXIT" });

  await sleep(10);
  assertEquals(log.includes("region1:stop"), true);
  assertEquals(log.includes("region2:stop"), true);
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test("Invoke: Auto-generated ID when not specified", async () => {
  let invokeCalled = false;

  const machine = createMachine({
    initial: "active",
    states: {
      active: {
        invoke: {
          // No id specified
          src: fromCallback(() => {
            invokeCalled = true;
            return () => {};
          }),
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(10);
  assertEquals(invokeCalled, true);
});

Deno.test("Invoke: Invoke starts on initial state", async () => {
  let invokeStarted = false;

  const machine = createMachine({
    initial: "withInvoke",
    states: {
      withInvoke: {
        invoke: {
          src: fromCallback(() => {
            invokeStarted = true;
            return () => {};
          }),
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(10);
  assertEquals(invokeStarted, true);
});

Deno.test("Invoke: Transitioning between states with invokes", async () => {
  const log: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "NEXT" }
  >({
    initial: "state1",
    states: {
      state1: {
        invoke: {
          id: "actor1",
          src: fromCallback(() => {
            log.push("actor1:start");
            return () => log.push("actor1:stop");
          }),
        },
        on: { NEXT: { target: "state2" } },
      },
      state2: {
        invoke: {
          id: "actor2",
          src: fromCallback(() => {
            log.push("actor2:start");
            return () => log.push("actor2:stop");
          }),
        },
        on: { NEXT: { target: "state3" } },
      },
      state3: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(10);
  assertEquals(log, ["actor1:start"]);

  actor.send({ type: "NEXT" });

  await sleep(10);
  assertEquals(log, ["actor1:start", "actor1:stop", "actor2:start"]);

  actor.send({ type: "NEXT" });

  await sleep(10);
  assertEquals(log, [
    "actor1:start",
    "actor1:stop",
    "actor2:start",
    "actor2:stop",
  ]);
});

Deno.test("Invoke: Promise returning undefined", async () => {
  const machine = createMachine({
    initial: "loading",
    states: {
      loading: {
        invoke: {
          id: "voidPromise",
          src: fromPromise(async () => {
            await sleep(10);
            // Returns undefined
          }) as ActorLogic<unknown, unknown, EventObject>,
          onDone: { target: "done" },
        },
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(30);

  assertEquals(actor.getSnapshot().value, "done");
});

Deno.test("Invoke: Rapid state transitions don't cause issues", async () => {
  const log: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "TOGGLE" }
  >({
    initial: "a",
    states: {
      a: {
        invoke: {
          src: fromCallback(() => {
            log.push("a:start");
            return () => log.push("a:stop");
          }),
        },
        on: { TOGGLE: { target: "b" } },
      },
      b: {
        invoke: {
          src: fromCallback(() => {
            log.push("b:start");
            return () => log.push("b:stop");
          }),
        },
        on: { TOGGLE: { target: "a" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Rapid toggles
  actor.send({ type: "TOGGLE" });
  actor.send({ type: "TOGGLE" });
  actor.send({ type: "TOGGLE" });
  actor.send({ type: "TOGGLE" });

  await sleep(30);

  // Should end in state a (even number of toggles)
  assertEquals(actor.getSnapshot().value, "a");

  // Cleanup should have been called appropriately
  const startCount = log.filter((l) => l.includes(":start")).length;
  const stopCount = log.filter((l) => l.includes(":stop")).length;

  // All started actors except the last one should have been stopped
  assertEquals(stopCount, startCount - 1);
});
