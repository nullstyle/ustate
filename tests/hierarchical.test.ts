/**
 * Tests for hierarchical (nested) states
 */

import { assertEquals } from "@std/assert";
import { assign, createActor, createMachine } from "../src/mod.ts";

Deno.test("hierarchical - creates machine with nested states", () => {
  const machine = createMachine({
    id: "nested",
    initial: "parent",
    states: {
      parent: {
        initial: "child1",
        states: {
          child1: {},
          child2: {},
        },
      },
    },
  });

  assertEquals(machine.config.id, "nested");
  assertEquals(machine.initialState, "parent");
});

Deno.test("hierarchical - starts in nested initial state", () => {
  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "child1",
        states: {
          child1: {},
          child2: {},
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  const state = actor.getSnapshot();
  assertEquals(state.value, { parent: "child1" });
  assertEquals(state.matches("parent"), true);
  assertEquals(state.matches("parent.child1"), true);
  assertEquals(state.matches({ parent: "child1" }), true);
});

Deno.test("hierarchical - transitions between child states", () => {
  const machine = createMachine<
    Record<string, never>,
    { type: "NEXT" }
  >({
    initial: "parent",
    states: {
      parent: {
        initial: "child1",
        states: {
          child1: {
            on: {
              NEXT: { target: "child2" },
            },
          },
          child2: {},
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, { parent: "child1" });

  actor.send({ type: "NEXT" });
  assertEquals(actor.getSnapshot().value, { parent: "child2" });
});

Deno.test("hierarchical - transitions from child to top-level state", () => {
  const machine = createMachine<
    Record<string, never>,
    { type: "EXIT" }
  >({
    initial: "parent",
    states: {
      parent: {
        initial: "child1",
        states: {
          child1: {
            on: {
              EXIT: { target: "done" },
            },
          },
        },
      },
      done: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, { parent: "child1" });

  actor.send({ type: "EXIT" });
  assertEquals(actor.getSnapshot().value, "done");
});

Deno.test("hierarchical - deeply nested states", () => {
  const machine = createMachine<
    Record<string, never>,
    { type: "NEXT" }
  >({
    initial: "level1",
    states: {
      level1: {
        initial: "level2",
        states: {
          level2: {
            initial: "level3",
            states: {
              level3: {
                on: {
                  NEXT: { target: "level3b" },
                },
              },
              level3b: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  const state = actor.getSnapshot();
  assertEquals(state.value, { level1: { level2: "level3" } });
  assertEquals(state.matches("level1"), true);
  assertEquals(state.matches("level1.level2"), true);
  assertEquals(state.matches("level1.level2.level3"), true);

  actor.send({ type: "NEXT" });
  assertEquals(actor.getSnapshot().value, { level1: { level2: "level3b" } });
});

Deno.test("hierarchical - executes entry/exit actions in correct order", () => {
  const events: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "NEXT" } | { type: "EXIT" }
  >({
    initial: "parent",
    states: {
      parent: {
        entry: () => events.push("enter:parent"),
        exit: () => events.push("exit:parent"),
        initial: "child1",
        states: {
          child1: {
            entry: () => events.push("enter:child1"),
            exit: () => events.push("exit:child1"),
            on: {
              NEXT: { target: "child2" },
              EXIT: { target: "done" },
            },
          },
          child2: {
            entry: () => events.push("enter:child2"),
            exit: () => events.push("exit:child2"),
            on: {
              EXIT: { target: "done" },
            },
          },
        },
      },
      done: {
        entry: () => events.push("enter:done"),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Initial entry: parent -> child1
  assertEquals(events, ["enter:parent", "enter:child1"]);

  events.length = 0;
  actor.send({ type: "NEXT" });

  // Transition within parent: child1 -> child2
  assertEquals(events, ["exit:child1", "enter:child2"]);

  events.length = 0;
  actor.send({ type: "EXIT" });

  // Exit parent hierarchy: child2 -> parent -> done
  assertEquals(events, ["exit:child2", "exit:parent", "enter:done"]);
});

Deno.test("hierarchical - parent state handles event if child does not", () => {
  const machine = createMachine<
    { count: number },
    { type: "INC" } | { type: "RESET" }
  >({
    initial: "active",
    context: { count: 0 },
    states: {
      active: {
        on: {
          RESET: {
            actions: assign({ count: 0 }),
          },
        },
        initial: "idle",
        states: {
          idle: {
            on: {
              INC: {
                actions: assign({ count: ({ context }) => context.count + 1 }),
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "INC" });
  assertEquals(actor.getSnapshot().context.count, 1);

  // RESET is handled by parent
  actor.send({ type: "RESET" });
  assertEquals(actor.getSnapshot().context.count, 0);
});

Deno.test("hierarchical - context updates work with nested states", () => {
  const machine = createMachine<
    { value: string },
    { type: "UPDATE"; value: string }
  >({
    initial: "parent",
    context: { value: "" },
    states: {
      parent: {
        initial: "child",
        states: {
          child: {
            on: {
              UPDATE: {
                actions: assign({ value: ({ event }) => event.value }),
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "UPDATE", value: "hello" });
  assertEquals(actor.getSnapshot().context.value, "hello");
});
