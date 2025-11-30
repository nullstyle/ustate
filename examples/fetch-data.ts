/**
 * Example: Fetching data with promise actors
 *
 * This example demonstrates using invoked promise actors to fetch data
 * from an API with proper loading, success, and error states.
 */

import { assign, createActor, createMachine, fromPromise } from "../src/mod.ts";

interface User {
  id: number;
  name: string;
  email: string;
}

type Context = {
  users: User[];
  error: string | null;
};

type Events =
  | { type: "FETCH" }
  | { type: "RETRY" }
  | { type: "done.invoke.fetchUsers"; output: User[] }
  | { type: "error.invoke.fetchUsers"; error: Error };

const fetchMachine = createMachine<Context, Events>({
  id: "fetch",
  initial: "idle",
  context: {
    users: [],
    error: null,
  },
  states: {
    idle: {
      on: {
        FETCH: { target: "loading" },
      },
    },
    loading: {
      invoke: {
        id: "fetchUsers",
        src: fromPromise(async () => {
          console.log("Fetching users...");

          // Simulate API call
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Simulate successful response
          return [
            { id: 1, name: "Alice", email: "alice@example.com" },
            { id: 2, name: "Bob", email: "bob@example.com" },
            { id: 3, name: "Charlie", email: "charlie@example.com" },
          ];
        }),
        onDone: {
          target: "success",
          actions: assign<Context, Events>({
            users: ({ event }) => {
              if ("output" in event) {
                return event.output as User[];
              }
              return [];
            },
            error: null,
          }),
        },
        onError: {
          target: "failure",
          actions: assign<Context, Events>({
            error: ({ event }) => {
              if ("error" in event) {
                return (event.error as Error).message;
              }
              return "Unknown error";
            },
          }),
        },
      },
    },
    success: {
      on: {
        FETCH: { target: "loading" },
      },
    },
    failure: {
      on: {
        RETRY: { target: "loading" },
      },
    },
  },
});

// Create and run the actor
const actor = createActor(fetchMachine);

actor.subscribe((state) => {
  console.log("\n--- State Update ---");
  console.log("State:", state.value);
  console.log("Users:", state.context.users);
  if (state.context.error) {
    console.log("Error:", state.context.error);
  }
});

actor.start();

console.log("Starting fetch example...");
console.log("Current state:", actor.getSnapshot().value);

// Trigger fetch
actor.send({ type: "FETCH" });

// Wait for the promise to resolve
setTimeout(() => {
  console.log("\n=== Final State ===");
  const finalState = actor.getSnapshot();
  console.log("State:", finalState.value);
  console.log("Users:", finalState.context.users);
  console.log("\nFetch complete!");

  actor.stop();
}, 2000);
