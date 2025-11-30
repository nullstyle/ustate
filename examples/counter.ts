/**
 * Counter example - demonstrates basic state machine with context
 */

import { assign, createActor, createMachine } from "../src/mod.ts";

// Define the machine
const counterMachine = createMachine<
  { count: number },
  { type: "INC" } | { type: "DEC" } | { type: "SET"; value: number }
>({
  id: "counter",
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
        SET: {
          actions: assign({
            count: ({ event }) => "value" in event ? event.value : 0,
          }),
        },
      },
    },
  },
});

// Create and run the actor
const counterActor = createActor(counterMachine);

counterActor.subscribe((state) => {
  console.log("Count:", state.context.count);
});

counterActor.start();
// Logs: Count: 0

counterActor.send({ type: "INC" });
// Logs: Count: 1

counterActor.send({ type: "INC" });
// Logs: Count: 2

counterActor.send({ type: "DEC" });
// Logs: Count: 1

counterActor.send({ type: "SET", value: 10 });
// Logs: Count: 10

counterActor.stop();
