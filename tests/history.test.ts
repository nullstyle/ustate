import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createMachine } from "../src/core/machine.ts";
import { createActor } from "../src/core/actor.ts";

Deno.test("History: Shallow history restores last active child", () => {
  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "a",
        states: {
          a: { on: { NEXT: { target: "b" } } },
          b: { on: { NEXT: { target: "c" } } },
          c: {},
          hist: { type: "history" },
        },
        on: { EXIT: { target: "other" } },
      },
      other: {
        on: { RETURN: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Move to 'b'
  actor.send({ type: "NEXT" });
  assertEquals(actor.getSnapshot().value, { parent: "b" });

  // Exit parent
  actor.send({ type: "EXIT" });
  assertEquals(actor.getSnapshot().value, "other");

  // Return to history
  actor.send({ type: "RETURN" });
  assertEquals(actor.getSnapshot().value, { parent: "b" });
});

Deno.test("History: Deep history restores deeply nested state", () => {
  const machine = createMachine({
    initial: "parent",
    states: {
      parent: {
        initial: "a",
        states: {
          a: {
            initial: "a1",
            states: {
              a1: { on: { NEXT: { target: "a2" } } },
              a2: {},
            },
          },
          hist: { type: "history", history: "deep" },
        },
        on: { EXIT: { target: "other" } },
      },
      other: {
        on: { RETURN: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Move to 'a.a2'
  actor.send({ type: "NEXT" });
  assertEquals(actor.getSnapshot().value, { parent: { a: "a2" } });

  // Exit parent
  actor.send({ type: "EXIT" });
  assertEquals(actor.getSnapshot().value, "other");

  // Return to deep history
  actor.send({ type: "RETURN" });
  assertEquals(actor.getSnapshot().value, { parent: { a: "a2" } });
});

Deno.test("History: Default target used when no history exists", () => {
  const machine = createMachine({
    initial: "other",
    states: {
      parent: {
        initial: "a",
        states: {
          a: {},
          b: {},
          hist: { type: "history", target: "b" },
        },
      },
      other: {
        on: { ENTER: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Enter directly to history, expect default target 'b'
  actor.send({ type: "ENTER" });
  assertEquals(actor.getSnapshot().value, { parent: "b" });
});

Deno.test("History: Fallback to initial state if no history and no target", () => {
  const machine = createMachine({
    initial: "other",
    states: {
      parent: {
        initial: "a",
        states: {
          a: {},
          b: {},
          hist: { type: "history" },
        },
      },
      other: {
        on: { ENTER: { target: "parent.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Enter history without history recorded -> go to initial 'a'
  actor.send({ type: "ENTER" });
  assertEquals(actor.getSnapshot().value, { parent: "a" });
});

Deno.test("History: Shallow history in parallel regions", () => {
  const machine = createMachine({
    initial: "active",
    states: {
      active: {
        type: "parallel",
        states: {
          region1: {
            initial: "off",
            states: {
              off: { on: { TOGGLE: { target: "on" } } },
              on: { on: { TOGGLE: { target: "off" } } },
              hist: { type: "history" },
            },
          },
          region2: {
            initial: "static",
            states: { static: {} },
          },
        },
        on: { STOP: { target: "idle" } },
      },
      idle: {
        on: { RESUME: { target: "active.region1.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Toggle region1 to 'on'
  actor.send({ type: "TOGGLE" });

  const snapshot1 = actor.getSnapshot().value as any;
  assertEquals(snapshot1.active.region1, "on");

  // Stop (exit parallel state)
  actor.send({ type: "STOP" });
  assertEquals(actor.getSnapshot().value, "idle");

  // Resume (target history of region1)
  actor.send({ type: "RESUME" });

  const snapshot2 = actor.getSnapshot().value as any;
  assertEquals(
    snapshot2.active.region1,
    "on",
    "Region 1 should restore to 'on'",
  );
  assertEquals(
    snapshot2.active.region2,
    "static",
    "Region 2 should reset to initial 'static'",
  );
});

Deno.test("History: Deep history ignores shallow changes", () => {
  const machine = createMachine({
    initial: "main",
    states: {
      main: {
        initial: "first",
        states: {
          first: {
            initial: "a",
            states: {
              a: { on: { NEXT: { target: "b" } } },
              b: {},
            },
            on: { OUTER_NEXT: { target: "second" } },
          },
          second: {},
          hist: { type: "history", history: "shallow" },
        },
        on: { EXIT: { target: "other" } },
      },
      other: {
        on: { RETURN: { target: "main.hist" } },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Move to first.b
  actor.send({ type: "NEXT" });
  assertEquals(actor.getSnapshot().value, { main: { first: "b" } });

  // Move to second (sibling of first)
  actor.send({ type: "OUTER_NEXT" });
  assertEquals(actor.getSnapshot().value, { main: "second" });

  // Exit
  actor.send({ type: "EXIT" });

  // Return to shallow history of main
  // 'main' was in 'second' when exited.
  actor.send({ type: "RETURN" });
  assertEquals(actor.getSnapshot().value, { main: "second" });
});
