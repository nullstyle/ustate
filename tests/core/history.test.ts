/**
 * Comprehensive History States Tests
 *
 * Task 1.1: History States (following XState patterns)
 * Tests for shallow, deep, default targets, and parallel region history.
 */

import { assertEquals } from "@std/assert";
import { createMachine } from "../../src/core/machine.ts";
import { createActor } from "../../src/core/actor.ts";
import { assign } from "../../src/actions/assign.ts";

// =============================================================================
// Deep vs. Shallow History Tests
// =============================================================================

Deno.test("History: Shallow history restores immediate child (simple case)", () => {
  // This test uses a simpler structure to verify basic shallow history behavior
  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "childA",
        states: {
          childA: {
            on: { GO_B: { target: "childB" } },
          },
          childB: {
            on: { GO_C: { target: "childC" } },
          },
          childC: {},
          hist: { type: "history" }, // Shallow by default
        },
        on: { EXIT: { target: "outside" } },
      },
      outside: {
        on: { RETURN: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Go to childB
  actor.send({ type: "GO_B" });
  assertEquals(actor.getSnapshot().value, { parent: "childB" });

  // Exit parent
  actor.send({ type: "EXIT" });
  assertEquals(actor.getSnapshot().value, "outside");

  // Return via shallow history - should restore to childB
  actor.send({ type: "RETURN" });
  const snapshot = actor.getSnapshot();
  assertEquals(snapshot.value, { parent: "childB" });
});

Deno.test("History: Deep history restores entire nested state hierarchy", () => {
  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "level1",
        states: {
          level1: {
            initial: "level2a",
            states: {
              level2a: {
                on: { GO_DEEP: { target: "level2b" } },
              },
              level2b: {
                initial: "level3a",
                states: {
                  level3a: {
                    on: { GO_DEEPER: { target: "level3b" } },
                  },
                  level3b: {},
                },
              },
            },
          },
          hist: { type: "history", history: "deep" },
        },
        on: { EXIT: { target: "outside" } },
      },
      outside: {
        on: { RETURN: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Go deep: parent.level1.level2b.level3b
  actor.send({ type: "GO_DEEP" });
  actor.send({ type: "GO_DEEPER" });
  assertEquals(actor.getSnapshot().value, {
    parent: { level1: { level2b: "level3b" } },
  });

  // Exit parent
  actor.send({ type: "EXIT" });
  assertEquals(actor.getSnapshot().value, "outside");

  // Return via deep history - should restore entire hierarchy
  actor.send({ type: "RETURN" });
  assertEquals(actor.getSnapshot().value, {
    parent: { level1: { level2b: "level3b" } },
  });
});

// =============================================================================
// Default Target Tests
// =============================================================================

Deno.test("History: Uses configured default target when no history recorded", () => {
  const machine = createMachine({
    initial: "outside",
    states: {
      parent: {
        initial: "a",
        states: {
          a: {},
          b: {},
          c: {},
          hist: { type: "history", target: "c" }, // Default to 'c'
        },
      },
      outside: {
        on: { ENTER_HISTORY: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "outside");

  // Enter via history without any prior history - should go to default target 'c'
  actor.send({ type: "ENTER_HISTORY" });
  assertEquals(actor.getSnapshot().value, { parent: "c" });
});

Deno.test("History: Falls back to parent's initial state when no target and no history", () => {
  const machine = createMachine({
    initial: "outside",
    states: {
      parent: {
        initial: "defaultChild",
        states: {
          defaultChild: {},
          otherChild: {},
          hist: { type: "history" }, // No target specified
        },
      },
      outside: {
        on: { ENTER_HISTORY: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Enter via history - should fall back to parent's initial 'defaultChild'
  actor.send({ type: "ENTER_HISTORY" });
  assertEquals(actor.getSnapshot().value, { parent: "defaultChild" });
});

Deno.test("History: Deep history default target with nested states", () => {
  const machine = createMachine({
    initial: "outside",
    states: {
      parent: {
        initial: "a",
        states: {
          a: {
            initial: "a1",
            states: {
              a1: {},
              a2: {},
            },
          },
          b: {
            initial: "b1",
            states: {
              b1: {},
              b2: {},
            },
          },
          hist: { type: "history", history: "deep", target: "b.b2" },
        },
      },
      outside: {
        on: { ENTER_HISTORY: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Enter via deep history with no prior history - should go to default 'b.b2'
  actor.send({ type: "ENTER_HISTORY" });
  assertEquals(actor.getSnapshot().value, { parent: { b: "b2" } });
});

// =============================================================================
// Parallel Region History Tests
// =============================================================================

Deno.test("History: Independent history in parallel regions", () => {
  const machine = createMachine({
    initial: "active",
    states: {
      active: {
        type: "parallel",
        states: {
          region1: {
            initial: "r1a",
            states: {
              r1a: { on: { R1_NEXT: { target: "r1b" } } },
              r1b: { on: { R1_NEXT: { target: "r1c" } } },
              r1c: {},
              r1hist: { type: "history" },
            },
          },
          region2: {
            initial: "r2a",
            states: {
              r2a: { on: { R2_NEXT: { target: "r2b" } } },
              r2b: {},
              r2hist: { type: "history" },
            },
          },
        },
        on: { STOP: { target: "idle" } },
      },
      idle: {
        on: {
          RESUME_R1: { target: "active.region1.r1hist" },
          RESUME_R2: { target: "active.region2.r2hist" },
          RESUME_ALL: { target: "active" },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Advance region1 to r1c and region2 to r2b
  actor.send({ type: "R1_NEXT" });
  actor.send({ type: "R1_NEXT" });
  actor.send({ type: "R2_NEXT" });

  // deno-lint-ignore no-explicit-any
  let snap = actor.getSnapshot().value as any;
  assertEquals(snap.active.region1, "r1c");
  assertEquals(snap.active.region2, "r2b");

  // Stop
  actor.send({ type: "STOP" });
  assertEquals(actor.getSnapshot().value, "idle");

  // Resume region1 history only - region2 should reset to initial
  actor.send({ type: "RESUME_R1" });
  // deno-lint-ignore no-explicit-any
  snap = actor.getSnapshot().value as any;
  assertEquals(snap.active.region1, "r1c", "Region 1 should restore to r1c");
  assertEquals(
    snap.active.region2,
    "r2a",
    "Region 2 should reset to initial r2a",
  );
});

Deno.test("History: Deep history in parallel regions preserves nested states", () => {
  const machine = createMachine({
    initial: "active",
    states: {
      active: {
        type: "parallel",
        states: {
          region1: {
            initial: "r1a",
            states: {
              r1a: {
                initial: "nested1",
                states: {
                  nested1: { on: { NEST: { target: "nested2" } } },
                  nested2: {},
                },
              },
              r1hist: { type: "history", history: "deep" },
            },
          },
          region2: {
            initial: "r2a",
            states: {
              r2a: {},
            },
          },
        },
        on: { STOP: { target: "idle" } },
      },
      idle: {
        on: { RESUME: { target: "active.region1.r1hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Go into nested state
  actor.send({ type: "NEST" });

  // deno-lint-ignore no-explicit-any
  let snap = actor.getSnapshot().value as any;
  assertEquals(snap.active.region1.r1a, "nested2");

  // Stop
  actor.send({ type: "STOP" });

  // Resume via deep history
  actor.send({ type: "RESUME" });
  // deno-lint-ignore no-explicit-any
  snap = actor.getSnapshot().value as any;
  assertEquals(
    snap.active.region1.r1a,
    "nested2",
    "Deep history should restore nested state",
  );
});

// =============================================================================
// History State Edge Cases
// =============================================================================

Deno.test("History: Multiple entries and exits preserve correct history", () => {
  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "a",
        states: {
          a: { on: { NEXT: { target: "b" } } },
          b: { on: { NEXT: { target: "c" } } },
          c: { on: { NEXT: { target: "a" } } },
          hist: { type: "history" },
        },
        on: { EXIT: { target: "outside" } },
      },
      outside: {
        on: { RETURN: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Go to b
  actor.send({ type: "NEXT" });
  assertEquals(actor.getSnapshot().value, { parent: "b" });

  // Exit and return via history
  actor.send({ type: "EXIT" });
  actor.send({ type: "RETURN" });
  assertEquals(actor.getSnapshot().value, { parent: "b" });

  // Go to c
  actor.send({ type: "NEXT" });
  assertEquals(actor.getSnapshot().value, { parent: "c" });

  // Exit and return via history - should now be c
  actor.send({ type: "EXIT" });
  actor.send({ type: "RETURN" });
  assertEquals(actor.getSnapshot().value, { parent: "c" });

  // Go to a
  actor.send({ type: "NEXT" });
  assertEquals(actor.getSnapshot().value, { parent: "a" });

  // Exit and return via history - should now be a
  actor.send({ type: "EXIT" });
  actor.send({ type: "RETURN" });
  assertEquals(actor.getSnapshot().value, { parent: "a" });
});

Deno.test("History: Sibling history states are independent", () => {
  const machine = createMachine({
    initial: "root",
    states: {
      root: {
        initial: "groupA",
        states: {
          groupA: {
            initial: "a1",
            states: {
              a1: { on: { A_NEXT: { target: "a2" } } },
              a2: {},
              aHist: { type: "history" },
            },
            on: { TO_B: { target: "groupB" } },
          },
          groupB: {
            initial: "b1",
            states: {
              b1: { on: { B_NEXT: { target: "b2" } } },
              b2: {},
              bHist: { type: "history" },
            },
            on: { TO_A_HIST: { target: "groupA.aHist" } },
          },
        },
        on: { EXIT: { target: "outside" } },
      },
      outside: {
        on: {
          TO_A_HIST: { target: "root.groupA.aHist" },
          TO_B_HIST: { target: "root.groupB.bHist" },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Move to a2
  actor.send({ type: "A_NEXT" });
  assertEquals(actor.getSnapshot().value, { root: { groupA: "a2" } });

  // Move to groupB
  actor.send({ type: "TO_B" });
  assertEquals(actor.getSnapshot().value, { root: { groupB: "b1" } });

  // Move to b2
  actor.send({ type: "B_NEXT" });
  assertEquals(actor.getSnapshot().value, { root: { groupB: "b2" } });

  // Exit
  actor.send({ type: "EXIT" });

  // Return to A's history - should be a2
  actor.send({ type: "TO_A_HIST" });
  assertEquals(actor.getSnapshot().value, { root: { groupA: "a2" } });

  // Exit and return to B's history - should be b2
  actor.send({ type: "EXIT" });
  actor.send({ type: "TO_B_HIST" });
  assertEquals(actor.getSnapshot().value, { root: { groupB: "b2" } });
});

Deno.test("History: Entry actions run when entering via history", () => {
  const entryLog: string[] = [];

  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "child",
        entry: () => entryLog.push("parent:entry"),
        states: {
          child: {
            entry: () => entryLog.push("child:entry"),
          },
          hist: { type: "history" },
        },
        on: { EXIT: { target: "outside" } },
      },
      outside: {
        on: { RETURN: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(entryLog, ["parent:entry", "child:entry"]);

  // Exit
  actor.send({ type: "EXIT" });
  entryLog.length = 0;

  // Return via history
  actor.send({ type: "RETURN" });
  assertEquals(entryLog, ["parent:entry", "child:entry"]);
});

Deno.test("History: Context preserved when using history", () => {
  const machine = createMachine({
    initial: "parent",
    context: { count: 0 },
    states: {
      parent: {
        initial: "counting",
        states: {
          counting: {
            on: {
              INC: {
                actions: assign({
                  count: ({ context }) => context.count + 1,
                }),
              },
            },
          },
          hist: { type: "history" },
        },
        on: { EXIT: { target: "outside" } },
      },
      outside: {
        on: { RETURN: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Increment a few times
  actor.send({ type: "INC" });
  actor.send({ type: "INC" });
  actor.send({ type: "INC" });
  assertEquals(actor.getSnapshot().context.count, 3);

  // Exit and return
  actor.send({ type: "EXIT" });
  actor.send({ type: "RETURN" });

  // Context should still be 3
  assertEquals(actor.getSnapshot().context.count, 3);
});

Deno.test("History: Transition directly to history state from within same region", () => {
  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "a",
        states: {
          a: { on: { TO_B: { target: "b" } } },
          b: {
            on: {
              TO_A: { target: "a" },
              TO_HIST: { target: "hist" },
            },
          },
          hist: { type: "history", target: "a" },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Go to b
  actor.send({ type: "TO_B" });
  assertEquals(actor.getSnapshot().value, { parent: "b" });

  // Go to a
  actor.send({ type: "TO_A" });
  assertEquals(actor.getSnapshot().value, { parent: "a" });

  // Go to b again
  actor.send({ type: "TO_B" });

  // Now use history - should go to 'a' (the last non-history state)
  actor.send({ type: "TO_HIST" });
  // History should recall we were in 'a' before going to 'b'
  // Actually, when we transition to hist from b, the history at that point is 'a'
  assertEquals(actor.getSnapshot().value, { parent: "a" });
});
