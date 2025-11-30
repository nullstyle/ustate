import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createMachine } from "../src/core/machine.ts";
import { createActor } from "../src/core/actor.ts";
import { assign } from "../src/actions/assign.ts";
import { sendParent, sendTo } from "../src/actions/spawn.ts";

// Helper for callback logic
function fromCallback(logic: any) {
  return { __type: "callback" as const, logic };
}

Deno.test("Bugfix: Parallel state actor independence", async () => {
  let callbackCallCount = 0;
  let cleanupCallCount = 0;

  const machine = createMachine({
    id: "parallel-test",
    initial: "active",
    states: {
      active: {
        type: "parallel",
        states: {
          regionA: {
            initial: "a1",
            states: {
              a1: {
                invoke: {
                  id: "serviceA",
                  src: fromCallback(({ receive }: any) => {
                    callbackCallCount++;
                    receive((event: any) => {
                      // Handle events if needed
                    });
                    return () => {
                      cleanupCallCount++;
                    };
                  }),
                },
                on: {
                  NEXT_A: { target: "a2" },
                },
              },
              a2: {},
            },
          },
          regionB: {
            initial: "b1",
            states: {
              b1: {
                on: {
                  NEXT_B: { target: "b2" },
                },
              },
              b2: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(callbackCallCount, 1, "Actor in Region A should start");
  assertEquals(
    cleanupCallCount,
    0,
    "Actor in Region A should not be stopped yet",
  );

  // Transition Region B
  actor.send({ type: "NEXT_B" });

  const snapshot = actor.getSnapshot();
  // We expect Region A to still be in a1, and Region B to be in b2
  // And critically, the actor in A should NOT have been stopped.

  assertEquals(
    cleanupCallCount,
    0,
    "Actor in Region A should persist when Region B transitions",
  );

  // Now transition Region A
  actor.send({ type: "NEXT_A" });

  assertEquals(
    cleanupCallCount,
    1,
    "Actor in Region A should stop when Region A transitions",
  );
});

Deno.test("Feature: Parent-Child communication via sendParent", () => {
  const childMachine = createMachine({
    id: "child",
    initial: "active",
    states: {
      active: {
        entry: sendParent({ type: "CHILD_GREETING", msg: "hello" }),
      },
    },
  });

  const parentMachine = createMachine({
    id: "parent",
    initial: "waiting",
    context: {
      greeting: null,
    },
    states: {
      waiting: {
        invoke: {
          id: "child",
          src: childMachine,
        },
        on: {
          CHILD_GREETING: {
            target: "received",
            actions: assign({
              greeting: ({ event }: any) => event.msg,
            }),
          },
        },
      },
      received: {},
    },
  });

  const actor = createActor(parentMachine);
  actor.start();

  const snapshot = actor.getSnapshot();
  assertEquals(
    snapshot.value,
    "received",
    "Parent should transition on child event",
  );
  assertEquals(
    snapshot.context.greeting,
    "hello",
    "Parent should receive data from child",
  );
});

Deno.test("Feature: Cross-Actor messaging via sendTo", () => {
  let childReceivedEvent: any = null;

  const childMachine = createMachine({
    id: "child",
    initial: "listening",
    context: { lastEvent: null as any },
    states: {
      listening: {
        on: {
          PING: {
            actions: assign({
              lastEvent: ({ event }: any) => {
                childReceivedEvent = event;
                return event;
              },
            }),
          },
        },
      },
    },
  });

  const parentMachine = createMachine({
    id: "parent",
    initial: "ready",
    states: {
      ready: {
        invoke: {
          id: "child-actor",
          src: childMachine,
        },
        on: {
          SEND_PING: {
            actions: sendTo("child-actor", { type: "PING", data: 123 }),
          },
        },
      },
    },
  });

  const actor = createActor(parentMachine);
  actor.start();

  actor.send({ type: "SEND_PING" });

  assertExists(childReceivedEvent, "Child should have received event");
  assertEquals((childReceivedEvent as any).type, "PING");
  assertEquals((childReceivedEvent as any).data, 123);
});

Deno.test("Bugfix: Context preservation (Date objects)", () => {
  const dateValue = new Date("2023-01-01T00:00:00Z");

  const machine = createMachine({
    initial: "step1",
    context: {
      created: dateValue,
      count: 0,
    },
    states: {
      step1: {
        on: {
          NEXT: {
            target: "step2",
            actions: assign({
              count: ({ context }) => context.count + 1,
            }),
          },
        },
      },
      step2: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  const initialSnapshot = actor.getSnapshot();
  assert(
    initialSnapshot.context.created instanceof Date,
    "Context property should remain a Date object",
  );
  assertEquals(
    initialSnapshot.context.created.toISOString(),
    dateValue.toISOString(),
  );

  actor.send({ type: "NEXT" });

  const nextSnapshot = actor.getSnapshot();
  assert(
    nextSnapshot.context.created instanceof Date,
    "Context property should remain a Date object after transition",
  );
  assertEquals(
    nextSnapshot.context.created.toISOString(),
    dateValue.toISOString(),
  );
  assertEquals(nextSnapshot.context.count, 1);
});

Deno.test("Feature: Spawning actors within assign action", () => {
  let childStarted = false;

  const childMachine = createMachine({
    id: "child",
    initial: "active",
    states: {
      active: {
        entry: () => {
          childStarted = true;
        },
      },
    },
  });

  const machine = createMachine({
    context: {
      childRef: null as any,
    },
    initial: "idle",
    states: {
      idle: {
        on: {
          SPAWN: {
            actions: assign({
              childRef: ({ spawn }: any) => {
                return spawn(childMachine);
              },
            }),
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();
  actor.send({ type: "SPAWN" });

  const snapshot = actor.getSnapshot();
  assertExists(
    snapshot.context.childRef,
    "Child reference should exist in context",
  );
  assert(childStarted, "Child actor should have started");
});
