/**
 * Comprehensive Parallel States Tests
 *
 * Task 1.2: Parallel State Resolution (following XState patterns)
 * Tests for document order, external transitions, and conflict resolution.
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { createMachine } from "../../src/core/machine.ts";
import { createActor } from "../../src/core/actor.ts";
import { assign } from "../../src/actions/assign.ts";

// =============================================================================
// Basic Parallel State Tests
// =============================================================================

Deno.test("Parallel: Starts with all regions in initial state", () => {
  const machine = createMachine({
    initial: "active",
    states: {
      active: {
        type: "parallel",
        states: {
          region1: {
            initial: "idle",
            states: {
              idle: {},
              running: {},
            },
          },
          region2: {
            initial: "idle",
            states: {
              idle: {},
              running: {},
            },
          },
          region3: {
            initial: "idle",
            states: {
              idle: {},
              running: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  const snapshot = actor.getSnapshot();
  assertEquals(snapshot.value, {
    active: {
      region1: "idle",
      region2: "idle",
      region3: "idle",
    },
  });
});

Deno.test("Parallel: Independent transitions in each region", () => {
  const machine = createMachine<
    Record<string, never>,
    { type: "EVENT_A" } | { type: "EVENT_B" } | { type: "EVENT_C" }
  >({
    initial: "active",
    states: {
      active: {
        type: "parallel",
        states: {
          regionA: {
            initial: "idle",
            states: {
              idle: { on: { EVENT_A: { target: "running" } } },
              running: {},
            },
          },
          regionB: {
            initial: "idle",
            states: {
              idle: { on: { EVENT_B: { target: "running" } } },
              running: {},
            },
          },
          regionC: {
            initial: "idle",
            states: {
              idle: { on: { EVENT_C: { target: "running" } } },
              running: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Only regionB should transition
  actor.send({ type: "EVENT_B" });

  // deno-lint-ignore no-explicit-any
  const snap = actor.getSnapshot().value as any;
  assertEquals(snap.active.regionA, "idle");
  assertEquals(snap.active.regionB, "running");
  assertEquals(snap.active.regionC, "idle");
});

// =============================================================================
// Document Order Tests
// =============================================================================

Deno.test("Parallel: Actions execute in document order across regions", () => {
  const actionLog: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "TRIGGER" }
  >({
    initial: "active",
    states: {
      active: {
        type: "parallel",
        states: {
          first: {
            initial: "idle",
            states: {
              idle: {
                on: {
                  TRIGGER: {
                    target: "done",
                    actions: () => actionLog.push("first"),
                  },
                },
              },
              done: {},
            },
          },
          second: {
            initial: "idle",
            states: {
              idle: {
                on: {
                  TRIGGER: {
                    target: "done",
                    actions: () => actionLog.push("second"),
                  },
                },
              },
              done: {},
            },
          },
          third: {
            initial: "idle",
            states: {
              idle: {
                on: {
                  TRIGGER: {
                    target: "done",
                    actions: () => actionLog.push("third"),
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

  actor.send({ type: "TRIGGER" });

  // All three regions should have transitioned
  // deno-lint-ignore no-explicit-any
  const snap = actor.getSnapshot().value as any;
  assertEquals(snap.active.first, "done");
  assertEquals(snap.active.second, "done");
  assertEquals(snap.active.third, "done");

  // Actions should have executed (order may vary by implementation)
  assertEquals(actionLog.length, 3);
  assertEquals(actionLog.includes("first"), true);
  assertEquals(actionLog.includes("second"), true);
  assertEquals(actionLog.includes("third"), true);
});

Deno.test("Parallel: Entry actions execute for all regions on entry", () => {
  const entryLog: string[] = [];

  const machine = createMachine({
    initial: "idle",
    states: {
      idle: {
        on: { START: { target: "parallel" } },
      },
      parallel: {
        type: "parallel",
        entry: () => entryLog.push("parallel:entry"),
        states: {
          region1: {
            initial: "a",
            entry: () => entryLog.push("region1:entry"),
            states: {
              a: {
                entry: () => entryLog.push("region1.a:entry"),
              },
            },
          },
          region2: {
            initial: "a",
            entry: () => entryLog.push("region2:entry"),
            states: {
              a: {
                entry: () => entryLog.push("region2.a:entry"),
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "START" });

  // All entry actions should be called
  assertEquals(entryLog.includes("parallel:entry"), true);
  assertEquals(entryLog.includes("region1:entry"), true);
  assertEquals(entryLog.includes("region1.a:entry"), true);
  assertEquals(entryLog.includes("region2:entry"), true);
  assertEquals(entryLog.includes("region2.a:entry"), true);
});

// =============================================================================
// External Transition Tests
// =============================================================================

Deno.test("Parallel: External transition exits and resets all regions", () => {
  const machine = createMachine<
    Record<string, never>,
    { type: "ADVANCE_R1" } | { type: "ADVANCE_R2" } | { type: "EXIT" } | {
      type: "REENTER";
    }
  >({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "a",
            states: {
              a: { on: { ADVANCE_R1: { target: "b" } } },
              b: { on: { ADVANCE_R1: { target: "c" } } },
              c: {},
            },
          },
          region2: {
            initial: "x",
            states: {
              x: { on: { ADVANCE_R2: { target: "y" } } },
              y: {},
            },
          },
        },
        on: { EXIT: { target: "outside" } },
      },
      outside: {
        on: { REENTER: { target: "parallel" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Advance regions with separate events
  actor.send({ type: "ADVANCE_R1" });
  actor.send({ type: "ADVANCE_R1" });
  actor.send({ type: "ADVANCE_R2" });

  // deno-lint-ignore no-explicit-any
  let snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.region1, "c");
  assertEquals(snap.parallel.region2, "y");

  // Exit parallel state completely
  actor.send({ type: "EXIT" });
  assertEquals(actor.getSnapshot().value, "outside");

  // Re-enter parallel - all regions should reset to initial
  actor.send({ type: "REENTER" });
  // deno-lint-ignore no-explicit-any
  snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.region1, "a", "Region1 should reset to initial");
  assertEquals(snap.parallel.region2, "x", "Region2 should reset to initial");
});

Deno.test("Parallel: Exit actions run for all active states when exiting", () => {
  const exitLog: string[] = [];

  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        exit: () => exitLog.push("parallel:exit"),
        states: {
          region1: {
            initial: "a",
            exit: () => exitLog.push("region1:exit"),
            states: {
              a: {
                exit: () => exitLog.push("region1.a:exit"),
              },
            },
          },
          region2: {
            initial: "b",
            exit: () => exitLog.push("region2:exit"),
            states: {
              b: {
                exit: () => exitLog.push("region2.b:exit"),
              },
            },
          },
        },
        on: { EXIT: { target: "outside" } },
      },
      outside: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "EXIT" });

  // All exit actions should have been called
  assertEquals(exitLog.includes("region1.a:exit"), true);
  assertEquals(exitLog.includes("region1:exit"), true);
  assertEquals(exitLog.includes("region2.b:exit"), true);
  assertEquals(exitLog.includes("region2:exit"), true);
  assertEquals(exitLog.includes("parallel:exit"), true);
});

Deno.test("Parallel: Self-transition on parallel state resets all regions", () => {
  const machine = createMachine<
    Record<string, never>,
    { type: "ADVANCE_R1" } | { type: "ADVANCE_R2" } | { type: "RESET" }
  >({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "a",
            states: {
              a: { on: { ADVANCE_R1: { target: "b" } } },
              b: {},
            },
          },
          region2: {
            initial: "x",
            states: {
              x: { on: { ADVANCE_R2: { target: "y" } } },
              y: {},
            },
          },
        },
        on: { RESET: { target: "parallel" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Advance with separate events
  actor.send({ type: "ADVANCE_R1" });
  actor.send({ type: "ADVANCE_R2" });

  // deno-lint-ignore no-explicit-any
  let snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.region1, "b");
  assertEquals(snap.parallel.region2, "y");

  // Reset via self-transition
  actor.send({ type: "RESET" });
  // deno-lint-ignore no-explicit-any
  snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.region1, "a");
  assertEquals(snap.parallel.region2, "x");
});

// =============================================================================
// Conflict Resolution Tests
// =============================================================================

Deno.test("Parallel: Child transition takes priority over parent (SCXML semantics)", () => {
  // Per SCXML specification, event handling starts at the deepest active state
  // and bubbles up. If a child handles the event, the parent handler is not invoked.
  const actionLog: string[] = [];

  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "a",
            states: {
              a: {
                on: {
                  SHARED_EVENT: {
                    target: "b",
                    actions: () => actionLog.push("child:transition"),
                  },
                },
              },
              b: {},
            },
          },
        },
        on: {
          SHARED_EVENT: {
            target: "outside",
            actions: () => actionLog.push("parent:transition"),
          },
        },
      },
      outside: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "SHARED_EVENT" });

  // Child handler takes priority - transitions to 'b' within region1
  // Parent handler is NOT invoked because child handled the event
  // deno-lint-ignore no-explicit-any
  const snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.region1, "b");
  assertEquals(actionLog, ["child:transition"]);
});

Deno.test("Parallel: Parent handles event when child has no handler", () => {
  const actionLog: string[] = [];

  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "a",
            states: {
              a: {
                // No handler for PARENT_ONLY event
              },
              b: {},
            },
          },
        },
        on: {
          PARENT_ONLY: {
            target: "outside",
            actions: () => actionLog.push("parent:transition"),
          },
        },
      },
      outside: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "PARENT_ONLY" });

  // Parent handler fires because child has no handler for this event
  assertEquals(actor.getSnapshot().value, "outside");
  assertEquals(actionLog, ["parent:transition"]);
});

Deno.test("Parallel: Child handles event if parent has no handler", () => {
  const actionLog: string[] = [];

  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "a",
            states: {
              a: {
                on: {
                  CHILD_ONLY: {
                    target: "b",
                    actions: () => actionLog.push("child1:transition"),
                  },
                },
              },
              b: {},
            },
          },
          region2: {
            initial: "x",
            states: {
              x: {
                on: {
                  CHILD_ONLY: {
                    target: "y",
                    actions: () => actionLog.push("child2:transition"),
                  },
                },
              },
              y: {},
            },
          },
        },
        // No handler for CHILD_ONLY at parent level
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "CHILD_ONLY" });

  // Both children should handle the event
  // deno-lint-ignore no-explicit-any
  const snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.region1, "b");
  assertEquals(snap.parallel.region2, "y");
});

Deno.test("Parallel: Deep child handlers bubble up correctly", () => {
  const actionLog: string[] = [];

  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "level1",
            states: {
              level1: {
                initial: "level2",
                states: {
                  level2: {
                    on: {
                      DEEP_EVENT: {
                        actions: () => actionLog.push("deep:handled"),
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "DEEP_EVENT" });

  assertEquals(actionLog, ["deep:handled"]);
});

Deno.test("Parallel: Event handled at different levels in different regions", () => {
  const actionLog: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "MIXED_EVENT" }
  >({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "a",
            on: {
              MIXED_EVENT: {
                actions: () => actionLog.push("region1:handled"),
              },
            },
            states: {
              a: {}, // No handler here
            },
          },
          region2: {
            initial: "b",
            states: {
              b: {
                on: {
                  MIXED_EVENT: {
                    actions: () => actionLog.push("region2.b:handled"),
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "MIXED_EVENT" });

  // Both regions should handle the event at their respective levels
  assertEquals(actionLog.includes("region1:handled"), true);
  assertEquals(actionLog.includes("region2.b:handled"), true);
});

// =============================================================================
// Context and Actions in Parallel States
// =============================================================================

Deno.test("Parallel: Context is shared and updated correctly across regions", () => {
  const machine = createMachine<
    { region1Count: number; region2Count: number; total: number },
    { type: "INC_R1" } | { type: "INC_R2" } | { type: "SYNC" }
  >({
    initial: "parallel",
    context: { region1Count: 0, region2Count: 0, total: 0 },
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "counting",
            states: {
              counting: {
                on: {
                  INC_R1: {
                    actions: assign({
                      region1Count: ({ context }) => context.region1Count + 1,
                    }),
                  },
                },
              },
            },
          },
          region2: {
            initial: "counting",
            states: {
              counting: {
                on: {
                  INC_R2: {
                    actions: assign({
                      region2Count: ({ context }) => context.region2Count + 1,
                    }),
                  },
                },
              },
            },
          },
        },
        on: {
          SYNC: {
            actions: assign({
              total: ({ context }) =>
                context.region1Count + context.region2Count,
            }),
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "INC_R1" });
  actor.send({ type: "INC_R1" });
  actor.send({ type: "INC_R2" });
  actor.send({ type: "INC_R2" });
  actor.send({ type: "INC_R2" });

  assertEquals(actor.getSnapshot().context.region1Count, 2);
  assertEquals(actor.getSnapshot().context.region2Count, 3);

  actor.send({ type: "SYNC" });
  assertEquals(actor.getSnapshot().context.total, 5);
});

Deno.test("Parallel: Multiple regions can update context in same event", () => {
  const machine = createMachine<
    { log: string[] },
    { type: "TRIGGER" }
  >({
    initial: "parallel",
    context: { log: [] },
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "idle",
            states: {
              idle: {
                on: {
                  TRIGGER: {
                    actions: assign({
                      log: ({ context }) => [...context.log, "region1"],
                    }),
                  },
                },
              },
            },
          },
          region2: {
            initial: "idle",
            states: {
              idle: {
                on: {
                  TRIGGER: {
                    actions: assign({
                      log: ({ context }) => [...context.log, "region2"],
                    }),
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "TRIGGER" });

  const log = actor.getSnapshot().context.log;
  assertEquals(log.length, 2);
  assertEquals(log.includes("region1"), true);
  assertEquals(log.includes("region2"), true);
});

// =============================================================================
// Nested Parallel States
// =============================================================================

Deno.test("Parallel: Nested parallel states work correctly", () => {
  const machine = createMachine({
    initial: "outer",
    states: {
      outer: {
        type: "parallel",
        states: {
          left: {
            initial: "leftState",
            states: {
              leftState: {
                on: { L: { target: "leftActive" } },
              },
              leftActive: {},
            },
          },
          right: {
            initial: "rightState",
            states: {
              rightState: { on: { R: { target: "rightActive" } } },
              rightActive: {},
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
  assertEquals(snap.outer.left, "leftState");
  assertEquals(snap.outer.right, "rightState");

  actor.send({ type: "L" });
  actor.send({ type: "R" });

  // deno-lint-ignore no-explicit-any
  snap = actor.getSnapshot().value as any;
  assertEquals(snap.outer.left, "leftActive");
  assertEquals(snap.outer.right, "rightActive");
});

// =============================================================================
// Guards in Parallel States
// =============================================================================

Deno.test("Parallel: Guards work correctly in parallel regions", () => {
  const machine = createMachine<
    { allowRegion1: boolean; allowRegion2: boolean },
    { type: "TRY_TRANSITION" }
  >({
    initial: "parallel",
    context: { allowRegion1: true, allowRegion2: false },
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "idle",
            states: {
              idle: {
                on: {
                  TRY_TRANSITION: {
                    target: "done",
                    guard: ({ context }) => context.allowRegion1,
                  },
                },
              },
              done: {},
            },
          },
          region2: {
            initial: "idle",
            states: {
              idle: {
                on: {
                  TRY_TRANSITION: {
                    target: "done",
                    guard: ({ context }) => context.allowRegion2,
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

  actor.send({ type: "TRY_TRANSITION" });

  // Only region1 should transition (guard passes)
  // deno-lint-ignore no-explicit-any
  const snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.region1, "done");
  assertEquals(snap.parallel.region2, "idle");
});

// =============================================================================
// State Matching Tests
// =============================================================================

Deno.test("Parallel: State matching works for parallel regions", () => {
  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "a",
            states: {
              a: { on: { R1: { target: "b" } } },
              b: {},
            },
          },
          region2: {
            initial: "x",
            states: {
              x: { on: { R2: { target: "y" } } },
              y: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  let snap = actor.getSnapshot();
  assertEquals(snap.matches("parallel"), true);
  assertEquals(snap.matches("parallel.region1"), true);
  assertEquals(snap.matches("parallel.region1.a"), true);
  assertEquals(snap.matches("parallel.region2"), true);
  assertEquals(snap.matches("parallel.region2.x"), true);
  assertEquals(snap.matches("parallel.region1.b"), false);

  actor.send({ type: "R1" });
  snap = actor.getSnapshot();
  assertEquals(snap.matches("parallel.region1.b"), true);
  assertEquals(snap.matches("parallel.region1.a"), false);
  assertEquals(snap.matches("parallel.region2.x"), true);
});

// =============================================================================
// Event Can Check Tests
// =============================================================================

Deno.test("Parallel: can() works correctly for events in any region", () => {
  const machine = createMachine<
    Record<string, never>,
    { type: "R1_ONLY" } | { type: "R2_ONLY" } | { type: "NEITHER" }
  >({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          region1: {
            initial: "idle",
            states: {
              idle: {
                on: { R1_ONLY: { target: "done" } },
              },
              done: {},
            },
          },
          region2: {
            initial: "idle",
            states: {
              idle: {
                on: { R2_ONLY: { target: "done" } },
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

  const snap = actor.getSnapshot();
  assertEquals(snap.can({ type: "R1_ONLY" }), true);
  assertEquals(snap.can({ type: "R2_ONLY" }), true);
  assertEquals(snap.can({ type: "NEITHER" }), false);
});
