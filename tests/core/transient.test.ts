/**
 * Comprehensive Transient (Always) Transitions Tests
 *
 * Task 1.4: Transient Transitions (following XState patterns)
 * Tests for guard evaluation, chained transients, and infinite loop detection.
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { createMachine } from "../../src/core/machine.ts";
import { createActor } from "../../src/core/actor.ts";
import { assign } from "../../src/actions/assign.ts";

// =============================================================================
// Basic Transient (Always) Transition Tests
// =============================================================================

Deno.test("Transient: Basic always transition fires immediately", () => {
  const machine = createMachine({
    initial: "transient",
    states: {
      transient: {
        always: { target: "final" },
      },
      final: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Should immediately transition to final
  assertEquals(actor.getSnapshot().value, "final");
});

Deno.test("Transient: Always transition with actions", () => {
  const actionLog: string[] = [];

  const machine = createMachine({
    initial: "start",
    states: {
      start: {
        always: {
          target: "end",
          actions: () => actionLog.push("always:action"),
        },
      },
      end: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "end");
  assertEquals(actionLog, ["always:action"]);
});

Deno.test("Transient: Entry and exit actions run with always transitions", () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "a",
    states: {
      a: {
        entry: () => log.push("a:entry"),
        exit: () => log.push("a:exit"),
        always: { target: "b" },
      },
      b: {
        entry: () => log.push("b:entry"),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "b");
  assertEquals(log, ["a:entry", "a:exit", "b:entry"]);
});

// =============================================================================
// Guard Evaluation Tests
// =============================================================================

Deno.test("Transient: Guarded always transition - guard passes", () => {
  const machine = createMachine({
    initial: "check",
    context: { value: 10 },
    states: {
      check: {
        always: {
          target: "high",
          guard: ({ context }) => context.value > 5,
        },
      },
      high: {},
      low: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "high");
});

Deno.test("Transient: Guarded always transition - guard fails, stays in state", () => {
  const machine = createMachine<
    { value: number },
    { type: "INCREMENT" }
  >({
    initial: "check",
    context: { value: 3 },
    states: {
      check: {
        on: {
          INCREMENT: {
            actions: assign({
              value: ({ context }) => context.value + 5,
            }),
          },
        },
        always: {
          target: "high",
          guard: ({ context }) => context.value > 5,
        },
      },
      high: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Guard fails (3 > 5 is false), should stay in check
  assertEquals(actor.getSnapshot().value, "check");

  // Now increment to make guard pass
  actor.send({ type: "INCREMENT" });
  assertEquals(actor.getSnapshot().value, "high");
});

Deno.test("Transient: Multiple guarded always transitions - first match wins", () => {
  const machine = createMachine({
    initial: "check",
    context: { value: 15 },
    states: {
      check: {
        always: [
          { target: "veryHigh", guard: ({ context }) => context.value > 20 },
          { target: "high", guard: ({ context }) => context.value > 10 },
          { target: "medium", guard: ({ context }) => context.value > 5 },
          { target: "low" },
        ],
      },
      veryHigh: {},
      high: {},
      medium: {},
      low: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // 15 > 10, so should go to "high"
  assertEquals(actor.getSnapshot().value, "high");
});

Deno.test("Transient: Fallback always transition when all guards fail", () => {
  const machine = createMachine({
    initial: "check",
    context: { value: 0 },
    states: {
      check: {
        always: [
          { target: "high", guard: ({ context }) => context.value > 10 },
          { target: "medium", guard: ({ context }) => context.value > 5 },
          { target: "low" }, // No guard - fallback
        ],
      },
      high: {},
      medium: {},
      low: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // All guards fail, should fall back to "low"
  assertEquals(actor.getSnapshot().value, "low");
});

Deno.test("Transient: Guard uses current context after actions", () => {
  const machine = createMachine({
    initial: "idle",
    context: { processed: false },
    states: {
      idle: {
        on: {
          PROCESS: {
            target: "processing",
            // deno-lint-ignore no-explicit-any
            actions: ({ context }: any) => {
              context.processed = true;
            },
          },
        },
      },
      processing: {
        always: [
          { target: "done", guard: ({ context }) => context.processed },
          { target: "error" },
        ],
      },
      done: {},
      error: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "idle");

  actor.send({ type: "PROCESS" });

  // After PROCESS, context.processed is true, so guard passes
  assertEquals(actor.getSnapshot().value, "done");
});

// =============================================================================
// Chained Transient Transitions Tests
// =============================================================================

Deno.test("Transient: Chained always transitions resolve in single step", () => {
  const entryLog: string[] = [];

  const machine = createMachine({
    initial: "step1",
    states: {
      step1: {
        entry: () => entryLog.push("step1"),
        always: { target: "step2" },
      },
      step2: {
        entry: () => entryLog.push("step2"),
        always: { target: "step3" },
      },
      step3: {
        entry: () => entryLog.push("step3"),
        always: { target: "step4" },
      },
      step4: {
        entry: () => entryLog.push("step4"),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Should resolve to final state without external events
  assertEquals(actor.getSnapshot().value, "step4");
  assertEquals(entryLog, ["step1", "step2", "step3", "step4"]);
});

Deno.test("Transient: Chained transitions with context updates", () => {
  const machine = createMachine({
    initial: "a",
    context: { trace: [] as string[] },
    states: {
      a: {
        entry: assign({
          trace: ({ context }) => [...context.trace, "a"],
        }),
        always: { target: "b" },
      },
      b: {
        entry: assign({
          trace: ({ context }) => [...context.trace, "b"],
        }),
        always: { target: "c" },
      },
      c: {
        entry: assign({
          trace: ({ context }) => [...context.trace, "c"],
        }),
        always: { target: "d" },
      },
      d: {
        entry: assign({
          trace: ({ context }) => [...context.trace, "d"],
        }),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "d");
  assertEquals(actor.getSnapshot().context.trace, ["a", "b", "c", "d"]);
});

Deno.test("Transient: Chained transitions with conditional branching", () => {
  const machine = createMachine({
    initial: "start",
    context: { path: "left" as "left" | "right" },
    states: {
      start: {
        always: [
          {
            target: "leftBranch",
            guard: ({ context }) => context.path === "left",
          },
          { target: "rightBranch" },
        ],
      },
      leftBranch: {
        always: { target: "leftEnd" },
      },
      rightBranch: {
        always: { target: "rightEnd" },
      },
      leftEnd: {},
      rightEnd: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "leftEnd");
});

Deno.test("Transient: Deep chain with mixed guards", () => {
  const machine = createMachine({
    initial: "check1",
    context: { level: 5 },
    states: {
      check1: {
        always: [
          { target: "high", guard: ({ context }) => context.level > 7 },
          { target: "check2" },
        ],
      },
      check2: {
        always: [
          { target: "medium", guard: ({ context }) => context.level > 3 },
          { target: "check3" },
        ],
      },
      check3: {
        always: { target: "low" },
      },
      high: {},
      medium: {},
      low: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // level=5: not > 7, so goes to check2. Then 5 > 3, so goes to medium
  assertEquals(actor.getSnapshot().value, "medium");
});

// =============================================================================
// Infinite Loop Detection Tests
// =============================================================================

Deno.test("Transient: Detects and halts infinite loop (A -> B -> A)", () => {
  const entryCount = { a: 0, b: 0 };

  const machine = createMachine({
    initial: "a",
    states: {
      a: {
        entry: () => entryCount.a++,
        always: { target: "b" },
      },
      b: {
        entry: () => entryCount.b++,
        always: { target: "a" },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Should have stopped due to loop detection
  // Entry counts should be limited
  assertEquals(entryCount.a < 150, true, "Loop should be limited");
  assertEquals(entryCount.b < 150, true, "Loop should be limited");
});

Deno.test("Transient: Detects longer cycles", () => {
  let iterations = 0;

  const machine = createMachine({
    initial: "a",
    states: {
      a: {
        entry: () => iterations++,
        always: { target: "b" },
      },
      b: {
        always: { target: "c" },
      },
      c: {
        always: { target: "d" },
      },
      d: {
        always: { target: "a" },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Should halt after detecting the cycle
  assertEquals(iterations < 150, true, "Long cycle should be detected");
});

Deno.test("Transient: Guard-breaking loop terminates correctly", () => {
  const machine = createMachine({
    initial: "counting",
    context: { count: 0 },
    states: {
      counting: {
        entry: assign({
          count: ({ context }) => context.count + 1,
        }),
        always: [
          { target: "done", guard: ({ context }) => context.count >= 5 },
          { target: "counting" },
        ],
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Should eventually reach done when count >= 5
  assertEquals(actor.getSnapshot().value, "done");
  assertEquals(actor.getSnapshot().context.count, 5);
});

// =============================================================================
// Always Transitions After Events
// =============================================================================

Deno.test("Transient: Always evaluated after event-driven transition", () => {
  const machine = createMachine({
    initial: "idle",
    context: { ready: false },
    states: {
      idle: {
        on: {
          MAKE_READY: {
            target: "check",
            // deno-lint-ignore no-explicit-any
            actions: ({ context }: any) => {
              context.ready = true;
            },
          },
        },
      },
      check: {
        always: [
          { target: "success", guard: ({ context }) => context.ready },
          { target: "failure" },
        ],
      },
      success: {},
      failure: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "idle");

  actor.send({ type: "MAKE_READY" });

  // After event, should go to check, then always to success
  assertEquals(actor.getSnapshot().value, "success");
});

Deno.test("Transient: Always transition in nested state", () => {
  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "transient",
        states: {
          transient: {
            always: { target: "stable" },
          },
          stable: {},
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, { parent: "stable" });
});

Deno.test("Transient: Always transition to sibling compound state", () => {
  const machine = createMachine({
    initial: "check",
    context: { goDeep: true },
    states: {
      check: {
        always: [
          { target: "compound", guard: ({ context }) => context.goDeep },
          { target: "simple" },
        ],
      },
      compound: {
        initial: "nested",
        states: {
          nested: {},
        },
      },
      simple: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, { compound: "nested" });
});

// =============================================================================
// Parallel States with Always Transitions
// =============================================================================

Deno.test("Transient: Always transitions in parallel regions", () => {
  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "transient1",
            states: {
              transient1: {
                always: { target: "stable1" },
              },
              stable1: {},
            },
          },
          region2: {
            initial: "transient2",
            states: {
              transient2: {
                always: { target: "stable2" },
              },
              stable2: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // deno-lint-ignore no-explicit-any
  const snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.region1, "stable1");
  assertEquals(snap.parallel.region2, "stable2");
});

Deno.test("Transient: Conditional always in parallel regions", () => {
  const machine = createMachine({
    initial: "parallel",
    context: { r1Ready: true, r2Ready: false },
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "check",
            states: {
              check: {
                always: [
                  { target: "ready", guard: ({ context }) => context.r1Ready },
                  { target: "waiting" },
                ],
              },
              ready: {},
              waiting: {},
            },
          },
          region2: {
            initial: "check",
            states: {
              check: {
                always: [
                  { target: "ready", guard: ({ context }) => context.r2Ready },
                  { target: "waiting" },
                ],
              },
              ready: {},
              waiting: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // deno-lint-ignore no-explicit-any
  const snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.region1, "ready");
  assertEquals(snap.parallel.region2, "waiting");
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test("Transient: No always transition if target not specified", () => {
  const actionCalled = { value: false };

  const machine = createMachine({
    initial: "start",
    states: {
      start: {
        always: {
          // No target - should execute action but stay in state
          actions: () => {
            actionCalled.value = true;
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Should stay in start since no target
  assertEquals(actor.getSnapshot().value, "start");
  // Action should have been called
  assertEquals(actionCalled.value, true);
});

Deno.test("Transient: Always with target to self (potential loop)", () => {
  let count = 0;

  const machine = createMachine({
    initial: "self",
    context: { iterations: 0 },
    states: {
      self: {
        entry: assign({
          iterations: ({ context }) => {
            count++;
            return context.iterations + 1;
          },
        }),
        always: [
          { target: "done", guard: ({ context }) => context.iterations >= 3 },
          { target: "self" },
        ],
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "done");
  assertEquals(actor.getSnapshot().context.iterations, 3);
});

Deno.test("Transient: Always transition respects state hierarchy", () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "child",
        entry: () => log.push("parent:entry"),
        exit: () => log.push("parent:exit"),
        states: {
          child: {
            entry: () => log.push("child:entry"),
            exit: () => log.push("child:exit"),
            always: { target: "sibling" },
          },
          sibling: {
            entry: () => log.push("sibling:entry"),
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, { parent: "sibling" });
  // Parent should not exit/re-enter for internal transition
  assertEquals(log, [
    "parent:entry",
    "child:entry",
    "child:exit",
    "sibling:entry",
  ]);
});

Deno.test("Transient: Named guards work with always transitions", () => {
  const machine = createMachine<
    { value: number },
    never
  >(
    {
      initial: "check",
      context: { value: 10 },
      states: {
        check: {
          always: [
            { target: "high", guard: { type: "isHigh" } },
            { target: "low" },
          ],
        },
        high: {},
        low: {},
      },
    },
    {
      guards: {
        isHigh: ({ context }) => context.value > 5,
      },
    },
  );

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "high");
});

Deno.test("Transient: Complex routing based on context", () => {
  type UserRole = "admin" | "user" | "guest";

  const machine = createMachine<
    { role: UserRole; verified: boolean },
    never
  >({
    initial: "router",
    context: { role: "user", verified: true },
    states: {
      router: {
        always: [
          {
            target: "adminDashboard",
            guard: ({ context }) => context.role === "admin",
          },
          {
            target: "userDashboard",
            guard: ({ context }) => context.role === "user" && context.verified,
          },
          {
            target: "verification",
            guard: ({ context }) =>
              context.role === "user" && !context.verified,
          },
          { target: "guestView" },
        ],
      },
      adminDashboard: {},
      userDashboard: {},
      verification: {},
      guestView: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "userDashboard");
});
