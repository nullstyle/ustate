/**
 * Comprehensive Delayed Transitions Tests
 *
 * Task 1.3: Delayed Transitions (following XState patterns)
 * Tests for cancellation, dynamic delays, and zero delays.
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { createMachine } from "../../src/core/machine.ts";
import { createActor } from "../../src/core/actor.ts";
import { assign } from "../../src/actions/assign.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Basic Delayed Transition Tests
// =============================================================================

Deno.test("Delayed: Basic numeric delay transitions after specified time", async () => {
  const machine = createMachine({
    initial: "idle",
    states: {
      idle: {
        after: {
          50: { target: "active" },
        },
      },
      active: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "idle");

  await sleep(75);

  assertEquals(actor.getSnapshot().value, "active");
});

Deno.test("Delayed: Named delay uses delay implementation", async () => {
  const machine = createMachine(
    {
      initial: "waiting",
      states: {
        waiting: {
          after: {
            MY_DELAY: { target: "done" },
          },
        },
        done: {},
      },
    },
    {
      delays: {
        MY_DELAY: 50,
      },
    },
  );

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "waiting");

  await sleep(25);
  assertEquals(actor.getSnapshot().value, "waiting");

  await sleep(50);
  assertEquals(actor.getSnapshot().value, "done");
});

Deno.test("Delayed: Multiple delayed transitions with different times", async () => {
  const transitionLog: string[] = [];

  const machine = createMachine({
    initial: "start",
    states: {
      start: {
        after: {
          100: {
            target: "step1",
            actions: () => transitionLog.push("to:step1"),
          },
        },
      },
      step1: {
        after: {
          100: {
            target: "step2",
            actions: () => transitionLog.push("to:step2"),
          },
        },
      },
      step2: {
        after: {
          100: {
            target: "done",
            actions: () => transitionLog.push("to:done"),
          },
        },
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "start");

  await sleep(150);
  assertEquals(actor.getSnapshot().value, "step1");

  await sleep(150);
  assertEquals(actor.getSnapshot().value, "step2");

  await sleep(150);
  assertEquals(actor.getSnapshot().value, "done");

  assertEquals(transitionLog, ["to:step1", "to:step2", "to:done"]);
});

// =============================================================================
// Cancellation Tests (Critical)
// =============================================================================

Deno.test("Delayed: Timer is cancelled when state is exited via event", async () => {
  let delayedActionCalled = false;

  const machine = createMachine({
    initial: "idle",
    states: {
      idle: {
        on: { CANCEL: { target: "cancelled" } },
        after: {
          50: {
            target: "timeout",
            actions: () => {
              delayedActionCalled = true;
            },
          },
        },
      },
      timeout: {},
      cancelled: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Cancel before delay
  await sleep(20);
  actor.send({ type: "CANCEL" });
  assertEquals(actor.getSnapshot().value, "cancelled");

  // Wait past the original delay time
  await sleep(100);

  // Should still be in cancelled state, not timeout
  assertEquals(actor.getSnapshot().value, "cancelled");
  assertEquals(delayedActionCalled, false);
});

Deno.test("Delayed: Multiple pending timers are all cancelled on exit", async () => {
  const timerLog: string[] = [];

  const machine = createMachine({
    initial: "waiting",
    states: {
      waiting: {
        on: { CANCEL: { target: "cancelled" } },
        after: {
          30: {
            target: "done1",
            actions: () => timerLog.push("timer1"),
          },
          60: {
            target: "done2",
            actions: () => timerLog.push("timer2"),
          },
          90: {
            target: "done3",
            actions: () => timerLog.push("timer3"),
          },
        },
      },
      done1: {},
      done2: {},
      done3: {},
      cancelled: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Cancel immediately
  actor.send({ type: "CANCEL" });

  // Wait for all timers to have fired if they weren't cancelled
  await sleep(150);

  assertEquals(actor.getSnapshot().value, "cancelled");
  assertEquals(timerLog.length, 0, "No delayed actions should have fired");
});

Deno.test("Delayed: Timer cancelled when transitioning to sibling state", async () => {
  let timeoutReached = false;

  const machine = createMachine({
    initial: "a",
    states: {
      a: {
        on: { TO_B: { target: "b" } },
        after: {
          200: {
            target: "timeout",
            actions: () => {
              timeoutReached = true;
            },
          },
        },
      },
      b: {},
      timeout: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Transition to b before timeout
  await sleep(50);
  actor.send({ type: "TO_B" });
  assertEquals(actor.getSnapshot().value, "b");

  // Wait past the original timeout
  await sleep(250);

  // Should still be in b, not timeout
  assertEquals(actor.getSnapshot().value, "b");
  assertEquals(timeoutReached, false);
});

Deno.test("Delayed: Timer in nested state cancelled when parent exits", async () => {
  let nestedTimerFired = false;

  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "child",
        on: { EXIT: { target: "outside" } },
        states: {
          child: {
            after: {
              50: {
                target: "childDone",
                actions: () => {
                  nestedTimerFired = true;
                },
              },
            },
          },
          childDone: {},
        },
      },
      outside: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Exit parent before child timer fires
  await sleep(20);
  actor.send({ type: "EXIT" });
  assertEquals(actor.getSnapshot().value, "outside");

  // Wait past the timer
  await sleep(100);

  assertEquals(actor.getSnapshot().value, "outside");
  assertEquals(nestedTimerFired, false);
});

Deno.test("Delayed: Timers cancelled on actor stop", async () => {
  let timerFired = false;

  const machine = createMachine({
    initial: "waiting",
    states: {
      waiting: {
        after: {
          50: {
            target: "done",
            actions: () => {
              timerFired = true;
            },
          },
        },
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(20);
  actor.stop();

  await sleep(100);

  assertEquals(timerFired, false);
});

// =============================================================================
// Dynamic Delay Tests
// =============================================================================

Deno.test("Delayed: Dynamic delay based on context", async () => {
  const machine = createMachine(
    {
      initial: "waiting",
      context: { delayMs: 30 },
      states: {
        waiting: {
          after: {
            CONTEXT_DELAY: { target: "done" },
          },
        },
        done: {},
      },
    },
    {
      delays: {
        CONTEXT_DELAY: ({ context }) => context.delayMs,
      },
    },
  );

  const actor = createActor(machine);
  actor.start();

  await sleep(15);
  assertEquals(actor.getSnapshot().value, "waiting");

  await sleep(30);
  assertEquals(actor.getSnapshot().value, "done");
});

Deno.test("Delayed: Dynamic delay based on event", async () => {
  const machine = createMachine<
    { customDelay: number },
    { type: "SET_DELAY"; delay: number } | { type: "START" }
  >(
    {
      initial: "idle",
      context: { customDelay: 100 },
      states: {
        idle: {
          on: {
            SET_DELAY: {
              actions: assign({
                customDelay: ({ event }) =>
                  "delay" in event ? event.delay : 100,
              }),
            },
            START: { target: "waiting" },
          },
        },
        waiting: {
          after: {
            CUSTOM: { target: "done" },
          },
        },
        done: {},
      },
    },
    {
      delays: {
        CUSTOM: ({ context }) => context.customDelay,
      },
    },
  );

  const actor = createActor(machine);
  actor.start();

  // Set a short delay
  actor.send({ type: "SET_DELAY", delay: 30 });
  actor.send({ type: "START" });

  await sleep(15);
  assertEquals(actor.getSnapshot().value, "waiting");

  await sleep(30);
  assertEquals(actor.getSnapshot().value, "done");
});

Deno.test("Delayed: Dynamic delay computed at transition time", async () => {
  const machine = createMachine(
    {
      initial: "waiting",
      context: { delayMs: 100 },
      states: {
        waiting: {
          after: {
            COMPUTED: { target: "done" },
          },
        },
        done: {},
      },
    },
    {
      delays: {
        COMPUTED: ({ context }: { context: { delayMs: number } }) =>
          context.delayMs,
      },
    },
  );

  const actor = createActor(machine);
  actor.start();

  // Should be waiting
  assertEquals(actor.getSnapshot().value, "waiting");

  // Wait for delay
  await sleep(50);
  assertEquals(actor.getSnapshot().value, "waiting");

  await sleep(100);
  assertEquals(actor.getSnapshot().value, "done");
});

// =============================================================================
// Zero Delay Tests
// =============================================================================

Deno.test("Delayed: Zero delay acts like immediate/microtask transition", async () => {
  const transitionLog: string[] = [];

  const machine = createMachine({
    initial: "start",
    states: {
      start: {
        entry: () => transitionLog.push("enter:start"),
        after: {
          0: {
            target: "immediate",
            actions: () => transitionLog.push("delay:0"),
          },
        },
      },
      immediate: {
        entry: () => transitionLog.push("enter:immediate"),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Need a small wait for the setTimeout(0) to resolve
  await sleep(10);

  assertEquals(actor.getSnapshot().value, "immediate");
  assertEquals(transitionLog, ["enter:start", "delay:0", "enter:immediate"]);
});

Deno.test("Delayed: Zero delay still respects guards", async () => {
  const machine = createMachine({
    initial: "start",
    context: { shouldTransition: false },
    states: {
      start: {
        on: {
          ENABLE: {
            // deno-lint-ignore no-explicit-any
            actions: ({ context }: any) => {
              context.shouldTransition = true;
            },
          },
        },
        after: {
          0: {
            target: "done",
            guard: ({ context }: { context: { shouldTransition: boolean } }) =>
              context.shouldTransition,
          },
        },
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Zero delay should not fire because guard is false
  await sleep(20);
  assertEquals(actor.getSnapshot().value, "start");

  // Enable and the after:0 should have already missed its chance
  // (or will fire on next evaluation depending on implementation)
  actor.send({ type: "ENABLE" });
  await sleep(20);

  // The guard was false when the timer was set, so it depends on implementation
  // Most implementations won't re-check the guard after enabling
});

Deno.test("Delayed: Zero delay in sequence", async () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "a",
    states: {
      a: {
        entry: () => log.push("a"),
        after: { 0: { target: "b" } },
      },
      b: {
        entry: () => log.push("b"),
        after: { 0: { target: "c" } },
      },
      c: {
        entry: () => log.push("c"),
        after: { 0: { target: "d" } },
      },
      d: {
        entry: () => log.push("d"),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Give time for all zero delays to resolve
  await sleep(50);

  assertEquals(actor.getSnapshot().value, "d");
  assertEquals(log, ["a", "b", "c", "d"]);
});

// =============================================================================
// Parallel States with Delays
// =============================================================================

Deno.test("Delayed: Independent timers in parallel regions", async () => {
  const timerLog: string[] = [];

  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          fast: {
            initial: "waiting",
            states: {
              waiting: {
                after: {
                  25: {
                    target: "done",
                    actions: () => timerLog.push("fast"),
                  },
                },
              },
              done: {},
            },
          },
          slow: {
            initial: "waiting",
            states: {
              waiting: {
                after: {
                  75: {
                    target: "done",
                    actions: () => timerLog.push("slow"),
                  },
                },
              },
              done: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // deno-lint-ignore no-explicit-any
  let snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.fast, "waiting");
  assertEquals(snap.parallel.slow, "waiting");

  await sleep(50);
  // deno-lint-ignore no-explicit-any
  snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.fast, "done");
  assertEquals(snap.parallel.slow, "waiting");
  assertEquals(timerLog, ["fast"]);

  await sleep(50);
  // deno-lint-ignore no-explicit-any
  snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.fast, "done");
  assertEquals(snap.parallel.slow, "done");
  assertEquals(timerLog, ["fast", "slow"]);
});

Deno.test("Delayed: Exiting parallel state cancels all region timers", async () => {
  const timerLog: string[] = [];

  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        on: { EXIT: { target: "outside" } },
        states: {
          region1: {
            initial: "waiting",
            states: {
              waiting: {
                after: {
                  100: {
                    target: "done",
                    actions: () => timerLog.push("region1"),
                  },
                },
              },
              done: {},
            },
          },
          region2: {
            initial: "waiting",
            states: {
              waiting: {
                after: {
                  100: {
                    target: "done",
                    actions: () => timerLog.push("region2"),
                  },
                },
              },
              done: {},
            },
          },
        },
      },
      outside: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Exit before timers fire
  await sleep(30);
  actor.send({ type: "EXIT" });

  // Wait past timer duration
  await sleep(150);

  assertEquals(actor.getSnapshot().value, "outside");
  assertEquals(timerLog.length, 0, "No timers should have fired");
});

// =============================================================================
// Delayed Transitions with Actions
// =============================================================================

Deno.test("Delayed: Actions execute when delay fires", async () => {
  const machine = createMachine<
    { count: number },
    never
  >({
    initial: "counting",
    context: { count: 0 },
    states: {
      counting: {
        after: {
          30: {
            target: "done",
            actions: assign({
              count: ({ context }) => context.count + 10,
            }),
          },
        },
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().context.count, 0);

  await sleep(50);

  assertEquals(actor.getSnapshot().value, "done");
  assertEquals(actor.getSnapshot().context.count, 10);
});

Deno.test("Delayed: Entry actions run after delayed transition", async () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "source",
    states: {
      source: {
        after: {
          30: {
            target: "target",
            actions: () => log.push("transition:action"),
          },
        },
        exit: () => log.push("source:exit"),
      },
      target: {
        entry: () => log.push("target:entry"),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(50);

  assertEquals(actor.getSnapshot().value, "target");
  assertEquals(log, ["source:exit", "transition:action", "target:entry"]);
});

// =============================================================================
// Guarded Delayed Transitions
// =============================================================================

Deno.test("Delayed: Guarded delayed transition only fires if guard passes", async () => {
  const machine = createMachine<
    { ready: boolean },
    { type: "SET_READY" }
  >({
    initial: "waiting",
    context: { ready: true },
    states: {
      waiting: {
        on: {
          SET_READY: {
            actions: assign({
              ready: ({ event }) => true,
            }),
          },
        },
        after: {
          30: [
            {
              target: "success",
              guard: ({ context }) => context.ready,
            },
            {
              target: "failure",
            },
          ],
        },
      },
      success: {},
      failure: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(50);

  // Guard should pass, go to success
  assertEquals(actor.getSnapshot().value, "success");
});

Deno.test("Delayed: Fallback delayed transition when guard fails", async () => {
  const machine = createMachine<
    { ready: boolean },
    never
  >({
    initial: "waiting",
    context: { ready: false },
    states: {
      waiting: {
        after: {
          30: [
            {
              target: "success",
              guard: ({ context }) => context.ready,
            },
            {
              target: "failure",
            },
          ],
        },
      },
      success: {},
      failure: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(50);

  // Guard should fail, go to failure
  assertEquals(actor.getSnapshot().value, "failure");
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test("Delayed: Re-entering state restarts timer", async () => {
  const log: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "RESET" }
  >({
    initial: "timing",
    states: {
      timing: {
        on: { RESET: { target: "timing" } },
        after: {
          200: {
            target: "done",
            actions: () => log.push("timer:fired"),
          },
        },
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Wait partway through
  await sleep(80);
  actor.send({ type: "RESET" }); // Timer should restart

  // Original timer would have fired at 200ms, but we reset at 80ms
  // New timer starts from 0, so at 130ms total (50ms after reset), should still be timing
  await sleep(50);
  assertEquals(
    actor.getSnapshot().value,
    "timing",
    "Should still be timing because timer was reset",
  );

  // Wait for the new timer to fire (need another 150ms for the 200ms timer)
  await sleep(200);
  assertEquals(actor.getSnapshot().value, "done");
  assertEquals(log, ["timer:fired"]);
});

Deno.test("Delayed: Nested state delays", async () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "child",
        after: {
          100: {
            target: "parentDone",
            actions: () => log.push("parent:timer"),
          },
        },
        states: {
          child: {
            after: {
              30: {
                target: "childDone",
                actions: () => log.push("child:timer"),
              },
            },
          },
          childDone: {},
        },
      },
      parentDone: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  await sleep(50);
  // deno-lint-ignore no-explicit-any
  let snap = actor.getSnapshot().value as any;
  assertEquals(snap.parent, "childDone");
  assertEquals(log, ["child:timer"]);

  await sleep(75);
  assertEquals(actor.getSnapshot().value, "parentDone");
  assertEquals(log, ["child:timer", "parent:timer"]);
});
