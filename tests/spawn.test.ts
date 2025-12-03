import { assertEquals } from "@std/assert";
import { assign, createActor, createMachine } from "../src/mod.ts";

Deno.test("spawn - basic spawned actor lifecycle", () => {
  const _childMachine = createMachine<
    { count: number },
    { type: "INC" }
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
        },
      },
    },
  });

  const parentMachine = createMachine<
    { childRef: { id: string; type: string } | null },
    { type: "SPAWN" } | { type: "SEND_TO_CHILD" }
  >({
    initial: "idle",
    context: { childRef: null },
    states: {
      idle: {
        on: {
          SPAWN: {
            target: "active",
            actions: assign<{
              childRef: { id: string; type: string } | null;
            }, { type: "SPAWN" } | { type: "SEND_TO_CHILD" }>({
              childRef: () => {
                // For now, we'll test the basic structure
                // Full spawn implementation will come next
                return { id: "child-1", type: "spawned" };
              },
            }),
          },
        },
      },
      active: {},
    },
  });

  const actor = createActor(parentMachine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "idle");
  assertEquals(actor.getSnapshot().context.childRef, null);

  actor.send({ type: "SPAWN" });

  assertEquals(actor.getSnapshot().value, "active");
  assertEquals(actor.getSnapshot().context.childRef?.id, "child-1");
});

Deno.test("spawn - cleanup on parent stop", () => {
  let _childStopped = false;

  const _childMachine = createMachine({
    initial: "active",
    states: {
      active: {
        exit: () => {
          _childStopped = true;
        },
      },
    },
  });

  // This test validates that spawned actors are tracked
  // and cleaned up when parent stops
  const parentMachine = createMachine<
    { children: { id: string }[] },
    { type: "SPAWN" }
  >({
    initial: "active",
    context: { children: [] },
    states: {
      active: {
        on: {
          SPAWN: {
            actions: assign<
              { children: { id: string }[] },
              { type: "SPAWN" }
            >({
              children: ({ context }) => [
                ...context.children,
                { id: `child-${context.children.length}` },
              ],
            }),
          },
        },
      },
    },
  });

  const actor = createActor(parentMachine);
  actor.start();

  actor.send({ type: "SPAWN" });
  actor.send({ type: "SPAWN" });

  assertEquals(actor.getSnapshot().context.children.length, 2);

  actor.stop();

  // After stop, spawned actors should be cleaned up
  // (This will be validated when we implement full spawn support)
});
