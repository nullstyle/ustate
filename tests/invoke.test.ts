import { assertEquals } from "@std/assert";
import { createActor, createMachine } from "../src/mod.ts";
import { fromCallback, fromPromise } from "../src/actors/logic.ts";
import type { ActorLogic, EventObject } from "../src/core/types.ts";

Deno.test("invoke - promise actor resolves successfully", async () => {
  const events: string[] = [];

  const machine = createMachine<
    { result?: string },
    | { type: "FETCH" }
    | { type: "done.invoke.fetcher"; output: string }
  >({
    initial: "idle",
    context: {},
    states: {
      idle: {
        on: {
          FETCH: { target: "loading" },
        },
      },
      loading: {
        invoke: {
          id: "fetcher",
          src: fromPromise(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return "Hello, World!";
          }) as ActorLogic<unknown, unknown, EventObject>,
          onDone: {
            target: "success",
            actions: ({ context, event }) => {
              events.push("onDone");
              if ("output" in event) {
                context.result = event.output as string;
              }
            },
          },
          onError: {
            target: "failure",
          },
        },
      },
      success: {},
      failure: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "idle");

  actor.send({ type: "FETCH" });
  assertEquals(actor.getSnapshot().value, "loading");

  // Wait for promise to resolve
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Should transition to success
  assertEquals(actor.getSnapshot().value, "success");
  assertEquals(events, ["onDone"]);
  assertEquals(actor.getSnapshot().context.result, "Hello, World!");
});

Deno.test("invoke - callback actor sends events back", async () => {
  const receivedEvents: Array<{ type: string; value?: number }> = [];

  const machine = createMachine<
    Record<string, never>,
    | { type: "START" }
    | { type: "TICK"; value: number }
    | { type: "STOP_TIMER" }
  >({
    initial: "idle",
    states: {
      idle: {
        on: {
          START: { target: "active" },
        },
      },
      active: {
        invoke: {
          id: "ticker",
          src: fromCallback(({ sendBack, receive }) => {
            let count = 0;
            const interval = setInterval(() => {
              count++;
              sendBack({ type: "TICK", value: count });
            }, 10);

            receive((event) => {
              if (event.type === "STOP_TIMER") {
                clearInterval(interval);
              }
            });

            return () => clearInterval(interval);
          }),
        },
        on: {
          TICK: {
            actions: ({ event }) => {
              receivedEvents.push(event);
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: "START" });
  assertEquals(actor.getSnapshot().value, "active");

  // Wait for some ticks
  await new Promise((resolve) => setTimeout(resolve, 35));

  // Should have received multiple tick events
  assertEquals(receivedEvents.length >= 2, true);
  assertEquals(receivedEvents[0].type, "TICK");
  assertEquals(receivedEvents[0].value, 1);

  actor.stop();
});

Deno.test("invoke - stops when exiting state", async () => {
  let cleanupCalled = false;

  const machine = createMachine<
    Record<string, never>,
    { type: "CANCEL" }
  >({
    initial: "active",
    states: {
      active: {
        invoke: {
          src: fromCallback(() => {
            return () => {
              cleanupCalled = true;
            };
          }),
        },
        on: {
          CANCEL: { target: "cancelled" },
        },
      },
      cancelled: {},
    },
  });

  const actor = createActor(machine);
  actor.start();

  assertEquals(actor.getSnapshot().value, "active");
  assertEquals(cleanupCalled, false);

  actor.send({ type: "CANCEL" });

  // Wait a bit for cleanup
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(actor.getSnapshot().value, "cancelled");
  assertEquals(cleanupCalled, true);
});
