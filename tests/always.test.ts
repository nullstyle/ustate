import { assertEquals } from "@std/assert";
import { createMachine } from "../src/core/machine.ts";
import { createActor } from "../src/core/actor.ts";
import { assign } from "../src/actions/assign.ts";

Deno.test("Always: Immediate transition from initial state", () => {
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

  assertEquals(actor.getSnapshot().value, "final");
});

Deno.test("Always: Guarded immediate transition", () => {
  const machine = createMachine({
    context: { count: 10 },
    initial: "check",
    states: {
      check: {
        always: [
          { target: "large", guard: ({ context }) => context.count > 5 },
          { target: "small" },
        ],
      },
      large: {},
      small: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "large");
});

Deno.test("Always: Chained transient states", () => {
  const machine = createMachine({
    initial: "step1",
    context: { trace: [] as string[] },
    states: {
      step1: {
        entry: assign({
          trace: ({ context }) => [...context.trace, "step1"],
        }),
        always: { target: "step2" },
      },
      step2: {
        entry: assign({
          trace: ({ context }) => [...context.trace, "step2"],
        }),
        always: { target: "step3" },
      },
      step3: {
        entry: assign({
          trace: ({ context }) => [...context.trace, "step3"],
        }),
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  const snapshot = actor.getSnapshot();
  assertEquals(snapshot.value, "step3");
  assertEquals(snapshot.context.trace, ["step1", "step2", "step3"]);
});

Deno.test("Always: Transition after normal event", () => {
  const machine = createMachine({
    initial: "idle",
    context: { success: true },
    states: {
      idle: {
        on: { START: { target: "process" } },
      },
      process: {
        always: [
          { target: "success", guard: ({ context }) => context.success },
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

  actor.send({ type: "START" });

  assertEquals(actor.getSnapshot().value, "success");
});

Deno.test("Always: Infinite loop detection", () => {
  const machine = createMachine({
    initial: "a",
    states: {
      a: {
        always: { target: "b" },
      },
      b: {
        always: { target: "a" },
      },
    },
  });

  const actor = createActor(machine);

  // This should not crash the process, but log a warning and stop transitioning
  // We can't easily assert on console.warn, but we ensure it finishes execution
  actor.start();

  // Should end up in one of the states after loop limit hit
  const val = actor.getSnapshot().value;
  assertEquals(typeof val, "string");
});
