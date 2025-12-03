import { assertEquals, assertRejects } from "@std/assert";
import { createMachine } from "../src/core/machine.ts";
import { createActor } from "../src/core/actor.ts";
import { waitFor } from "../src/utils.ts";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("waitFor: Resolves when predicate is met immediately", async () => {
  const machine = createMachine({
    initial: "active",
    states: { active: {} },
  });
  const actor = createActor(machine).start();

  const state = await waitFor(actor, (s) => s.matches("active"));
  assertEquals(state.value, "active");
});

Deno.test("waitFor: Resolves when predicate is met after transition", async () => {
  const machine = createMachine({
    initial: "a",
    states: {
      a: {
        after: { 10: "b" },
      },
      b: {},
    },
  });
  const actor = createActor(machine).start();

  const state = await waitFor(actor, (s) => s.matches("b"));
  assertEquals(state.value, "b");
});

Deno.test("waitFor: Rejects on timeout", async () => {
  const machine = createMachine({
    initial: "a",
    states: { a: {} },
  });
  const actor = createActor(machine).start();

  await assertRejects(
    async () => {
      await waitFor(actor, (s) => s.matches("b"), { timeout: 10 });
    },
    Error,
    "timeout",
  );
});

Deno.test("waitFor: Works with async invocation", async () => {
  const machine = createMachine({
    initial: "fetching",
    context: { data: null },
    states: {
      fetching: {
        invoke: {
          src: {
            __type: "promise",
            logic: async () => {
              await sleep(20);
              return "done";
            },
          },
          onDone: { target: "success" },
        },
      },
      success: {},
    },
  });
  const actor = createActor(machine).start();

  const state = await waitFor(actor, (s) => s.matches("success"));
  assertEquals(state.value, "success");
});
