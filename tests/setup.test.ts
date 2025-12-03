/**
 * Tests for setup function and implementations
 */

import { assertEquals } from "@std/assert";
import { assign, createActor, setup } from "../src/mod.ts";

Deno.test("setup - creates machine with named actions", () => {
  const events: string[] = [];

  const machineSetup = setup<
    { count: number },
    { type: "INC" }
  >({
    actions: {
      logInc: () => events.push("increment"),
    },
  });

  const machine = machineSetup.createMachine({
    initial: "active",
    context: { count: 0 },
    states: {
      active: {
        on: {
          INC: {
            actions: [
              { type: "logInc" },
              assign({ count: ({ context }) => context.count + 1 }),
            ],
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "INC" });
  assertEquals(events, ["increment"]);
  assertEquals(actor.getSnapshot().context.count, 1);
});

Deno.test("setup - creates machine with named guards", () => {
  const machineSetup = setup<
    { count: number },
    { type: "INC" }
  >({
    guards: {
      canIncrement: ({ context }) => context.count < 5,
    },
  });

  const machine = machineSetup.createMachine({
    initial: "active",
    context: { count: 0 },
    states: {
      active: {
        on: {
          INC: {
            guard: { type: "canIncrement" },
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

  // Should increment up to 5
  for (let i = 0; i < 10; i++) {
    actor.send({ type: "INC" });
  }

  assertEquals(actor.getSnapshot().context.count, 5);
});

Deno.test("machine.provide - overrides implementations", () => {
  const events: string[] = [];

  const machineSetup = setup<
    Record<string, never>,
    { type: "GREET" }
  >({
    actions: {
      greet: () => events.push("Hello"),
    },
  });

  const baseMachine = machineSetup.createMachine({
    initial: "active",
    states: {
      active: {
        on: {
          GREET: {
            actions: { type: "greet" },
          },
        },
      },
    },
  });

  const customMachine = baseMachine.provide({
    actions: {
      greet: () => events.push("Hola"),
    },
  });

  // Test base machine
  const baseActor = createActor(baseMachine);
  baseActor.start();
  baseActor.send({ type: "GREET" });
  assertEquals(events, ["Hello"]);

  // Test custom machine
  events.length = 0;
  const customActor = createActor(customMachine);
  customActor.start();
  customActor.send({ type: "GREET" });
  assertEquals(events, ["Hola"]);
});
