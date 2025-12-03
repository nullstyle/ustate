/**
 * Tests for machine creation and basic functionality
 */

import { assertEquals, assertThrows } from "@std/assert";
import { assign, createActor, createMachine } from "../src/mod.ts";

Deno.test("createMachine - creates a valid machine", () => {
  const machine = createMachine({
    id: "test",
    initial: "idle",
    states: {
      idle: {},
    },
  });

  assertEquals(machine.config.id, "test");
  assertEquals(machine.initialState, "idle");
});

Deno.test("createMachine - throws error without initial state", () => {
  assertThrows(
    () => {
      // @ts-ignore - testing invalid config
      createMachine({
        states: { idle: {} },
      });
    },
    Error,
    "Machine must have an initial state",
  );
});

Deno.test("createMachine - throws error with invalid initial state", () => {
  assertThrows(
    () => {
      createMachine({
        initial: "nonexistent",
        states: { idle: {} },
      });
    },
    Error,
    'Initial state "nonexistent" not found',
  );
});

Deno.test("createActor - starts in initial state", () => {
  const machine = createMachine({
    initial: "idle",
    context: { count: 0 },
    states: {
      idle: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  const state = actor.getSnapshot();
  assertEquals(state.value, "idle");
  assertEquals(state.context.count, 0);
});

Deno.test("createActor - transitions between states", () => {
  const machine = createMachine<
    Record<string, never>,
    { type: "TOGGLE" }
  >({
    initial: "inactive",
    states: {
      inactive: {
        on: {
          TOGGLE: { target: "active" },
        },
      },
      active: {
        on: {
          TOGGLE: { target: "inactive" },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "inactive");

  actor.send({ type: "TOGGLE" });
  assertEquals(actor.getSnapshot().value, "active");

  actor.send({ type: "TOGGLE" });
  assertEquals(actor.getSnapshot().value, "inactive");
});

Deno.test("createActor - updates context with assign", () => {
  const machine = createMachine<
    { count: number },
    { type: "INC" } | { type: "DEC" }
  >({
    initial: "active",
    context: { count: 0 },
    states: {
      active: {
        on: {
          INC: {
            actions: assign({
              count: ({ context }) => context.count + 1,
            }),
          },
          DEC: {
            actions: assign({
              count: ({ context }) => context.count - 1,
            }),
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().context.count, 0);

  actor.send({ type: "INC" });
  assertEquals(actor.getSnapshot().context.count, 1);

  actor.send({ type: "INC" });
  assertEquals(actor.getSnapshot().context.count, 2);

  actor.send({ type: "DEC" });
  assertEquals(actor.getSnapshot().context.count, 1);
});

Deno.test("createActor - executes entry and exit actions", () => {
  const events: string[] = [];

  const machine = createMachine<
    Record<string, never>,
    { type: "TOGGLE" }
  >({
    initial: "inactive",
    states: {
      inactive: {
        entry: () => events.push("enter:inactive"),
        exit: () => events.push("exit:inactive"),
        on: {
          TOGGLE: { target: "active" },
        },
      },
      active: {
        entry: () => events.push("enter:active"),
        exit: () => events.push("exit:active"),
        on: {
          TOGGLE: { target: "inactive" },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(events, ["enter:inactive"]);

  actor.send({ type: "TOGGLE" });
  assertEquals(events, ["enter:inactive", "exit:inactive", "enter:active"]);

  actor.send({ type: "TOGGLE" });
  assertEquals(events, [
    "enter:inactive",
    "exit:inactive",
    "enter:active",
    "exit:active",
    "enter:inactive",
  ]);
});

Deno.test("createActor - respects guards", () => {
  const machine = createMachine<
    { count: number },
    { type: "INC" }
  >({
    initial: "active",
    context: { count: 0 },
    states: {
      active: {
        on: {
          INC: {
            guard: ({ context }) => context.count < 3,
            actions: assign({
              count: ({ context }) => context.count + 1,
            }),
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "INC" });
  assertEquals(actor.getSnapshot().context.count, 1);

  actor.send({ type: "INC" });
  assertEquals(actor.getSnapshot().context.count, 2);

  actor.send({ type: "INC" });
  assertEquals(actor.getSnapshot().context.count, 3);

  // This should be blocked by the guard
  actor.send({ type: "INC" });
  assertEquals(actor.getSnapshot().context.count, 3);
});

Deno.test("state.matches - checks current state", () => {
  const machine = createMachine({
    initial: "idle",
    states: {
      idle: {},
      active: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  const state = actor.getSnapshot();
  assertEquals(state.matches("idle"), true);
  assertEquals(state.matches("active"), false);
});

Deno.test("state.can - checks if event can be handled", () => {
  const machine = createMachine<
    Record<string, never>,
    { type: "START" } | { type: "STOP" }
  >({
    initial: "idle",
    states: {
      idle: {
        on: {
          START: { target: "active" },
        },
      },
      active: {
        on: {
          STOP: { target: "idle" },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  let state = actor.getSnapshot();
  assertEquals(state.can({ type: "START" }), true);
  assertEquals(state.can({ type: "STOP" }), false);

  actor.send({ type: "START" });
  state = actor.getSnapshot();
  assertEquals(state.can({ type: "START" }), false);
  assertEquals(state.can({ type: "STOP" }), true);
});
