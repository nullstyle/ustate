/**
 * LCA (Lowest Common Ancestor) Stress Tests
 *
 * Task 3.1: LCA Stress Test
 * Tests for the internal LCA algorithm that determines which states
 * to exit/enter during transitions.
 */

import { assertEquals } from "@std/assert";
import { createMachine } from "../../src/core/machine.ts";
import { createActor } from "../../src/core/actor.ts";
import { assign } from "../../src/actions/assign.ts";

// =============================================================================
// Cross-Branch Transition Tests
// =============================================================================

Deno.test("LCA: Cross-branch transition between nested states", () => {
  const exitLog: string[] = [];
  const entryLog: string[] = [];

  const machine = createMachine({
    initial: "branchA",
    states: {
      branchA: {
        initial: "a1",
        entry: () => entryLog.push("branchA:entry"),
        exit: () => exitLog.push("branchA:exit"),
        states: {
          a1: {
            entry: () => entryLog.push("a1:entry"),
            exit: () => exitLog.push("a1:exit"),
            on: { TO_B: { target: "branchB" } },
          },
        },
        on: { GO_B: { target: "branchB" } },
      },
      branchB: {
        initial: "b1",
        entry: () => entryLog.push("branchB:entry"),
        exit: () => exitLog.push("branchB:exit"),
        states: {
          b1: {
            entry: () => entryLog.push("b1:entry"),
            exit: () => exitLog.push("b1:exit"),
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Clear logs after initial entry
  exitLog.length = 0;
  entryLog.length = 0;

  // Transition from branchA.a1 to branchB
  actor.send({ type: "GO_B" });

  // Verify exits happened (order may vary by implementation)
  assertEquals(exitLog.includes("a1:exit"), true);
  assertEquals(exitLog.includes("branchA:exit"), true);

  // Verify entries happened
  assertEquals(entryLog.includes("branchB:entry"), true);
  assertEquals(entryLog.includes("b1:entry"), true);

  // Verify final state
  assertEquals(actor.getSnapshot().value, { branchB: "b1" });
});

Deno.test("LCA: Transition between sibling states at same depth", () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "childA",
        entry: () => log.push("parent:entry"),
        exit: () => log.push("parent:exit"),
        states: {
          childA: {
            entry: () => log.push("childA:entry"),
            exit: () => log.push("childA:exit"),
            on: { TO_B: { target: "childB" } },
          },
          childB: {
            entry: () => log.push("childB:entry"),
            exit: () => log.push("childB:exit"),
            on: { TO_A: { target: "childA" } },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  log.length = 0;

  actor.send({ type: "TO_B" });

  // Parent should NOT exit/re-enter for sibling transition
  assertEquals(log, ["childA:exit", "childB:entry"]);
  assertEquals(actor.getSnapshot().value, { parent: "childB" });
});

Deno.test("LCA: Transition from child to sibling branch", () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "level1",
    states: {
      level1: {
        initial: "level2",
        entry: () => log.push("level1:entry"),
        exit: () => log.push("level1:exit"),
        states: {
          level2: {
            initial: "level3",
            entry: () => log.push("level2:entry"),
            exit: () => log.push("level2:exit"),
            states: {
              level3: {
                entry: () => log.push("level3:entry"),
                exit: () => log.push("level3:exit"),
                on: { GO_SIBLING: { target: "level3b" } },
              },
              level3b: {
                entry: () => log.push("level3b:entry"),
                exit: () => log.push("level3b:exit"),
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, { level1: { level2: "level3" } });

  log.length = 0;

  // Transition from level3 to sibling level3b
  actor.send({ type: "GO_SIBLING" });

  // Should exit level3 and enter level3b
  assertEquals(log.includes("level3:exit"), true);
  assertEquals(log.includes("level3b:entry"), true);

  // Parent states should NOT have exited/re-entered
  const level1ExitCount = log.filter((l) => l === "level1:exit").length;
  const level2ExitCount = log.filter((l) => l === "level2:exit").length;
  assertEquals(
    level1ExitCount,
    0,
    "level1 should not exit for sibling transition",
  );
  assertEquals(
    level2ExitCount,
    0,
    "level2 should not exit for sibling transition",
  );

  // Final state should be level3b
  assertEquals(actor.getSnapshot().value, { level1: { level2: "level3b" } });
});

// =============================================================================
// Self-Transition Tests
// =============================================================================

Deno.test("LCA: Self-transition on compound state re-enters children", () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "child",
        entry: () => log.push("parent:entry"),
        exit: () => log.push("parent:exit"),
        on: { SELF: { target: "parent" } },
        states: {
          child: {
            entry: () => log.push("child:entry"),
            exit: () => log.push("child:exit"),
            on: { TO_SIBLING: { target: "sibling" } },
          },
          sibling: {
            entry: () => log.push("sibling:entry"),
            exit: () => log.push("sibling:exit"),
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Go to sibling
  actor.send({ type: "TO_SIBLING" });
  assertEquals(actor.getSnapshot().value, { parent: "sibling" });

  log.length = 0;

  // Self-transition on parent
  actor.send({ type: "SELF" });

  // Should exit sibling, exit parent, enter parent, enter child (initial)
  assertEquals(log.includes("sibling:exit"), true);
  assertEquals(log.includes("parent:exit"), true);
  assertEquals(log.includes("parent:entry"), true);
  assertEquals(log.includes("child:entry"), true);

  // Should reset to initial child state
  assertEquals(actor.getSnapshot().value, { parent: "child" });
});

Deno.test("LCA: Self-transition on leaf state", () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "state",
    context: { count: 0 },
    states: {
      state: {
        entry: () => log.push("state:entry"),
        exit: () => log.push("state:exit"),
        on: {
          SELF: {
            target: "state",
            actions: assign({ count: ({ context }) => context.count + 1 }),
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  log.length = 0;

  actor.send({ type: "SELF" });

  assertEquals(log, ["state:exit", "state:entry"]);
  assertEquals(actor.getSnapshot().context.count, 1);

  actor.send({ type: "SELF" });
  assertEquals(actor.getSnapshot().context.count, 2);
});

// =============================================================================
// Complex LCA Scenarios
// =============================================================================

Deno.test("LCA: Transition across multiple branches with shared ancestor", () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "root",
    states: {
      root: {
        initial: "left",
        entry: () => log.push("root:entry"),
        exit: () => log.push("root:exit"),
        states: {
          left: {
            initial: "leftChild",
            entry: () => log.push("left:entry"),
            exit: () => log.push("left:exit"),
            states: {
              leftChild: {
                entry: () => log.push("leftChild:entry"),
                exit: () => log.push("leftChild:exit"),
                on: { TO_RIGHT: { target: "rightChild" } },
              },
              rightChild: {
                entry: () => log.push("rightChild:entry"),
                exit: () => log.push("rightChild:exit"),
              },
            },
          },
          right: {
            initial: "rightA",
            entry: () => log.push("right:entry"),
            exit: () => log.push("right:exit"),
            states: {
              rightA: {
                entry: () => log.push("rightA:entry"),
                exit: () => log.push("rightA:exit"),
                on: { TO_LEFT: { target: "#root.root.left.leftChild" } },
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Should be in root.left.leftChild
  assertEquals(actor.getSnapshot().value, { root: { left: "leftChild" } });

  log.length = 0;

  // Transition within same parent (left)
  actor.send({ type: "TO_RIGHT" });

  // Only leftChild should exit, rightChild should enter
  assertEquals(log, ["leftChild:exit", "rightChild:entry"]);
  assertEquals(actor.getSnapshot().value, { root: { left: "rightChild" } });
});

Deno.test("LCA: Transition with context preservation", () => {
  const machine = createMachine({
    initial: "a",
    context: { visits: { a: 0, b: 0, c: 0 } },
    states: {
      a: {
        entry: assign({
          visits: ({ context }) => ({
            ...context.visits,
            a: context.visits.a + 1,
          }),
        }),
        on: { TO_B: { target: "b" } },
      },
      b: {
        entry: assign({
          visits: ({ context }) => ({
            ...context.visits,
            b: context.visits.b + 1,
          }),
        }),
        on: { TO_C: { target: "c" } },
      },
      c: {
        entry: assign({
          visits: ({ context }) => ({
            ...context.visits,
            c: context.visits.c + 1,
          }),
        }),
        on: { TO_A: { target: "a" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().context.visits, { a: 1, b: 0, c: 0 });

  actor.send({ type: "TO_B" });
  assertEquals(actor.getSnapshot().context.visits, { a: 1, b: 1, c: 0 });

  actor.send({ type: "TO_C" });
  assertEquals(actor.getSnapshot().context.visits, { a: 1, b: 1, c: 1 });

  actor.send({ type: "TO_A" });
  assertEquals(actor.getSnapshot().context.visits, { a: 2, b: 1, c: 1 });
});

Deno.test("LCA: Transition within parallel region", () => {
  const log: string[] = [];

  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        entry: () => log.push("parallel:entry"),
        exit: () => log.push("parallel:exit"),
        states: {
          region1: {
            initial: "r1a",
            entry: () => log.push("region1:entry"),
            exit: () => log.push("region1:exit"),
            states: {
              r1a: {
                entry: () => log.push("r1a:entry"),
                exit: () => log.push("r1a:exit"),
                on: { R1_NEXT: { target: "r1b" } },
              },
              r1b: {
                entry: () => log.push("r1b:entry"),
                exit: () => log.push("r1b:exit"),
              },
            },
          },
          region2: {
            initial: "r2a",
            entry: () => log.push("region2:entry"),
            exit: () => log.push("region2:exit"),
            states: {
              r2a: {
                entry: () => log.push("r2a:entry"),
                exit: () => log.push("r2a:exit"),
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  log.length = 0;

  // Transition within region1 should not affect region2 or parallel
  actor.send({ type: "R1_NEXT" });

  // Only r1a should exit and r1b should enter
  assertEquals(log.includes("r1a:exit"), true);
  assertEquals(log.includes("r1b:entry"), true);
  assertEquals(log.includes("region1:exit"), false);
  assertEquals(log.includes("region2:exit"), false);
  assertEquals(log.includes("parallel:exit"), false);

  // deno-lint-ignore no-explicit-any
  const snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.region1, "r1b");
  assertEquals(snap.parallel.region2, "r2a");
});

Deno.test("LCA: Deep hierarchy with sibling transitions", () => {
  // Create a machine with deep nesting
  const machine = createMachine({
    initial: "l1",
    states: {
      l1: {
        initial: "l2",
        states: {
          l2: {
            initial: "l3",
            states: {
              l3: {
                initial: "l4",
                states: {
                  l4: {
                    on: {
                      GO_SIBLING: { target: "l4b" },
                    },
                  },
                  l4b: {
                    on: {
                      GO_BACK: { target: "l4" },
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

  // Verify initial deep state
  assertEquals(actor.getSnapshot().value, {
    l1: { l2: { l3: "l4" } },
  });

  // Transition to sibling at deep level
  actor.send({ type: "GO_SIBLING" });
  assertEquals(actor.getSnapshot().value, {
    l1: { l2: { l3: "l4b" } },
  });

  // Transition back
  actor.send({ type: "GO_BACK" });
  assertEquals(actor.getSnapshot().value, {
    l1: { l2: { l3: "l4" } },
  });
});

Deno.test("LCA: Transitions in parallel regions with separate events", () => {
  const transitionLog: string[] = [];

  const machine = createMachine({
    initial: "parallel",
    states: {
      parallel: {
        type: "parallel",
        states: {
          first: {
            initial: "a",
            states: {
              a: {
                on: {
                  FIRST: {
                    target: "b",
                    actions: () => transitionLog.push("first:a->b"),
                  },
                },
              },
              b: {},
            },
          },
          second: {
            initial: "x",
            states: {
              x: {
                on: {
                  SECOND: {
                    target: "y",
                    actions: () => transitionLog.push("second:x->y"),
                  },
                },
              },
              y: {},
            },
          },
          third: {
            initial: "m",
            states: {
              m: {
                on: {
                  THIRD: {
                    target: "n",
                    actions: () => transitionLog.push("third:m->n"),
                  },
                },
              },
              n: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Send separate events to each region
  actor.send({ type: "FIRST" });
  actor.send({ type: "SECOND" });
  actor.send({ type: "THIRD" });

  // All three regions should have transitioned
  assertEquals(transitionLog.length, 3);

  // deno-lint-ignore no-explicit-any
  const snap = actor.getSnapshot().value as any;
  assertEquals(snap.parallel.first, "b");
  assertEquals(snap.parallel.second, "y");
  assertEquals(snap.parallel.third, "n");
});
