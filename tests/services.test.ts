/**
 * Tests for SystemServices - deterministic ID generation
 */

import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import {
  createActor,
  createCounterServices,
  createDeterministicServices,
  createMachine,
  fromCallback,
  resetServices,
  setServices,
  withServices,
} from "../src/mod.ts";
import type { EventObject } from "../src/mod.ts";

Deno.test("Services: Counter services produce predictable IDs", () => {
  const services = createCounterServices();

  assertEquals(services.generateId("actor"), "actor-0");
  assertEquals(services.generateId("actor"), "actor-1");
  assertEquals(services.generateId("invoked"), "invoked-2");
  assertEquals(services.generateId(), "3");
});

Deno.test("Services: Counter services start from custom value", () => {
  const services = createCounterServices(100);

  assertEquals(services.generateId("test"), "test-100");
  assertEquals(services.generateId("test"), "test-101");
});

Deno.test("Services: Deterministic services with same seed produce same IDs", () => {
  const services1 = createDeterministicServices(12345);
  const services2 = createDeterministicServices(12345);

  const id1a = services1.generateId("actor");
  const id1b = services1.generateId("actor");

  const id2a = services2.generateId("actor");
  const id2b = services2.generateId("actor");

  assertEquals(id1a, id2a);
  assertEquals(id1b, id2b);

  services1.dispose?.();
  services2.dispose?.();
});

Deno.test("Services: Different seeds produce different IDs", () => {
  const services1 = createDeterministicServices(11111);
  const services2 = createDeterministicServices(22222);

  const id1 = services1.generateId("actor");
  const id2 = services2.generateId("actor");

  assertNotEquals(id1, id2);

  services1.dispose?.();
  services2.dispose?.();
});

Deno.test("Services: withServices isolates service changes", () => {
  const counterServices = createCounterServices();

  const id1 = withServices(counterServices, () => {
    return counterServices.generateId("test");
  });

  assertEquals(id1, "test-0");

  // After withServices, global services should be reset
  // (to whatever they were before, which is default)
});

Deno.test("Services: setServices and resetServices work correctly", () => {
  const counterServices = createCounterServices();

  const previous = setServices(counterServices);

  // Now counter services are active globally
  assertEquals(counterServices.generateId("x"), "x-0");

  // Reset to previous
  setServices(previous);

  // And we can reset entirely
  resetServices();
});

Deno.test("Services: Machine uses services for invoke IDs", async () => {
  interface Events extends EventObject {
    type: "DONE" | "done.invoke.invoked-0";
  }

  const machine = createMachine<{ result: string }, Events>({
    id: "test",
    initial: "loading",
    context: { result: "" },
    states: {
      loading: {
        invoke: {
          // No ID specified - will be generated
          src: fromCallback(({ sendBack }) => {
            sendBack({ type: "done.invoke.invoked-0" } as Events);
          }),
        },
        on: {
          "done.invoke.invoked-0": { target: "done" },
        },
      },
      done: {},
    },
  });

  // Use counter services so we know the invoke ID will be "invoked-0"
  await withServices(createCounterServices(), async () => {
    const actor = createActor(machine);
    actor.start();

    // Wait a tick for the callback to fire
    await new Promise((resolve) => setTimeout(resolve, 10));

    const snapshot = actor.getSnapshot();
    assertEquals(snapshot.value, "done");

    actor.stop();
  });
});

Deno.test("Services: Deterministic replay of state machine", () => {
  interface Context {
    count: number;
  }

  interface Events extends EventObject {
    type: "INC" | "DEC";
  }

  const machine = createMachine<Context, Events>({
    id: "counter",
    initial: "active",
    context: { count: 0 },
    states: {
      active: {
        on: {
          INC: {
            actions: (ctx) => {
              ctx.context.count++;
            },
          },
          DEC: {
            actions: (ctx) => {
              ctx.context.count--;
            },
          },
        },
      },
    },
  });

  // Run the same sequence twice with same seed
  const runWithSeed = (seed: number) => {
    const services = createDeterministicServices(seed);
    const result = withServices(services, () => {
      const actor = createActor(machine);
      actor.start();
      actor.send({ type: "INC" });
      actor.send({ type: "INC" });
      actor.send({ type: "DEC" });
      const result = actor.getSnapshot().context.count;
      actor.stop();
      return result;
    });
    services.dispose?.();
    return result;
  };

  const result1 = runWithSeed(42);
  const result2 = runWithSeed(42);

  assertEquals(result1, result2);
  assertEquals(result1, 1);
});

Deno.test("Services: now() returns predictable timestamps with counter services", () => {
  const services = createCounterServices();

  assertEquals(services.now(), 0);
  assertEquals(services.now(), 1000);
  assertEquals(services.now(), 2000);
});

Deno.test("Services: now() returns seed-based timestamps with deterministic services", () => {
  const services = createDeterministicServices(1000);

  // First call returns start time
  const t1 = services.now();
  assertEquals(t1, 1000);

  // Each generateId call advances the counter
  services.generateId("x");
  const t2 = services.now();
  assertEquals(t2, 1100); // 1000 + 1*100 (counter is 1 after one generateId call)

  services.dispose?.();
});
