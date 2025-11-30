import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createMachine } from "../src/core/machine.ts";
import { createActor } from "../src/core/actor.ts";
import { assign } from "../src/actions/assign.ts";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("Delayed transitions: explicit numeric delay", async () => {
  const machine = createMachine({
    initial: "idle",
    states: {
      idle: {
        after: {
          100: { target: "active" },
        },
      },
      active: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "idle");

  await sleep(150);

  assertEquals(actor.getSnapshot().value, "active");
});

Deno.test("Delayed transitions: named delay", async () => {
  const machine = createMachine(
    {
      initial: "idle",
      states: {
        idle: {
          after: {
            TIMEOUT: { target: "active" },
          },
        },
        active: {},
      },
    },
    {
      delays: {
        TIMEOUT: 100,
      },
    },
  );

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "idle");

  await sleep(150);

  assertEquals(actor.getSnapshot().value, "active");
});

Deno.test("Delayed transitions: cancellation on transition", async () => {
  const machine = createMachine({
    initial: "idle",
    states: {
      idle: {
        on: { NEXT: { target: "stopped" } },
        after: {
          100: { target: "active" },
        },
      },
      active: {},
      stopped: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "idle");

  // Fire event before delay
  actor.send({ type: "NEXT" });
  assertEquals(actor.getSnapshot().value, "stopped");

  // Wait past delay
  await sleep(150);

  // Should still be stopped, not active
  assertEquals(actor.getSnapshot().value, "stopped");
});

Deno.test("Delayed transitions: parallel states", async () => {
  const machine = createMachine({
    initial: "root",
    states: {
      root: {
        type: "parallel",
        states: {
          timer1: {
            initial: "idle",
            states: {
              idle: {
                after: { 50: "done" },
              },
              done: {},
            },
          },
          timer2: {
            initial: "idle",
            states: {
              idle: {
                after: { 100: "done" },
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

  const getSnapshot = () => (actor.getSnapshot().value as any).root;

  // Initial state
  assertEquals(getSnapshot().timer1, "idle");
  assertEquals(getSnapshot().timer2, "idle");

  // After first timer
  await sleep(75);
  assertEquals(getSnapshot().timer1, "done");
  assertEquals(getSnapshot().timer2, "idle");

  // After second timer
  await sleep(50);
  assertEquals(getSnapshot().timer1, "done");
  assertEquals(getSnapshot().timer2, "done");
});

Deno.test("Delayed transitions: dynamic delay expression", async () => {
  const machine = createMachine(
    {
      context: { delayMs: 50 },
      initial: "idle",
      states: {
        idle: {
          after: {
            DYNAMIC_DELAY: { target: "active" },
          },
        },
        active: {},
      },
    },
    {
      delays: {
        DYNAMIC_DELAY: ({ context }) => context.delayMs,
      },
    },
  );

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "idle");

  await sleep(75);

  assertEquals(actor.getSnapshot().value, "active");
});
