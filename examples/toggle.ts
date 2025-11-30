/**
 * Toggle example - demonstrates simple state transitions
 */

import { createActor, createMachine } from "../src/mod.ts";

// Define the machine
const toggleMachine = createMachine<
  Record<string, never>,
  { type: "TOGGLE" }
>({
  id: "toggle",
  initial: "inactive",
  states: {
    inactive: {
      entry: () => console.log("Entering inactive state"),
      on: {
        TOGGLE: { target: "active" },
      },
      exit: () => console.log("Exiting inactive state"),
    },
    active: {
      entry: () => console.log("Entering active state"),
      on: {
        TOGGLE: { target: "inactive" },
      },
      exit: () => console.log("Exiting active state"),
    },
  },
});

// Create and run the actor
const toggleActor = createActor(toggleMachine);

toggleActor.subscribe((state) => {
  console.log("Current state:", state.value);
  console.log("Is active?", state.matches("active"));
});

toggleActor.start();
// Logs: Entering inactive state
// Logs: Current state: inactive
// Logs: Is active? false

toggleActor.send({ type: "TOGGLE" });
// Logs: Exiting inactive state
// Logs: Entering active state
// Logs: Current state: active
// Logs: Is active? true

toggleActor.send({ type: "TOGGLE" });
// Logs: Exiting active state
// Logs: Entering inactive state
// Logs: Current state: inactive
// Logs: Is active? false

toggleActor.stop();
// Logs: Exiting inactive state
