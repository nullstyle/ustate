/**
 * Example: Timer with callback actors
 *
 * This example demonstrates using invoked callback actors to create
 * a timer that sends tick events back to the parent machine.
 */

import {
  assign,
  createActor,
  createMachine,
  fromCallback,
} from "../src/mod.ts";

type Context = {
  count: number;
  startTime: number;
};

type Events =
  | { type: "START" }
  | { type: "STOP" }
  | { type: "RESET" }
  | { type: "TICK"; timestamp: number }
  | { type: "STOP_TIMER" };

const timerMachine = createMachine<Context, Events>({
  id: "timer",
  initial: "idle",
  context: {
    count: 0,
    startTime: 0,
  },
  states: {
    idle: {
      entry: assign({
        count: 0,
        startTime: 0,
      }),
      on: {
        START: { target: "running" },
      },
    },
    running: {
      entry: assign<Context, Events>({
        startTime: () => Date.now(),
      }),
      invoke: {
        id: "ticker",
        src: fromCallback<Events>(({ sendBack, receive }) => {
          let count = 0;

          console.log("Timer started");

          const interval = setInterval(() => {
            count++;
            sendBack({ type: "TICK", timestamp: Date.now() });
          }, 1000);

          // Listen for stop command
          receive((event) => {
            if (event.type === "STOP_TIMER") {
              console.log("Timer received stop command");
              clearInterval(interval);
            }
          });

          // Cleanup function
          return () => {
            console.log("Timer cleanup");
            clearInterval(interval);
          };
        }),
      },
      on: {
        TICK: {
          actions: assign({
            count: ({ context }) => context.count + 1,
          }),
        },
        STOP: { target: "stopped" },
        RESET: { target: "idle" },
      },
    },
    stopped: {
      on: {
        START: { target: "running" },
        RESET: { target: "idle" },
      },
    },
  },
});

// Create and run the actor
const actor = createActor(timerMachine);

actor.subscribe((state) => {
  const elapsed = state.context.startTime > 0
    ? Math.floor((Date.now() - state.context.startTime) / 1000)
    : 0;

  console.log(
    `[${state.value}] Count: ${state.context.count}, Elapsed: ${elapsed}s`,
  );
});

actor.start();

console.log("Timer Example");
console.log("=============\n");

// Start the timer
setTimeout(() => {
  console.log("> Starting timer...\n");
  actor.send({ type: "START" });
}, 500);

// Stop after 3 seconds
setTimeout(() => {
  console.log("\n> Stopping timer...\n");
  actor.send({ type: "STOP" });
}, 3500);

// Restart
setTimeout(() => {
  console.log("\n> Restarting timer...\n");
  actor.send({ type: "START" });
}, 4500);

// Reset after 2 more seconds
setTimeout(() => {
  console.log("\n> Resetting timer...\n");
  actor.send({ type: "RESET" });
}, 6500);

// Final stop
setTimeout(() => {
  console.log("\n> Final stop\n");
  actor.stop();
  console.log("Timer example complete!");
}, 7000);
