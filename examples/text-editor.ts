/**
 * Text editor example - demonstrates guards and complex context
 */

import { assign, createActor, setup } from "../src/mod.ts";

// Define types
type Context = {
  committedValue: string;
  value: string;
};

type Events =
  | { type: "text.edit" }
  | { type: "text.change"; value: string }
  | { type: "text.commit" }
  | { type: "text.cancel" };

// Create machine with setup for type safety
const textMachineSetup = setup<Context, Events>({
  actions: {
    logValue: ({ context }) => {
      console.log("Current value:", context.value);
    },
  },
  guards: {
    hasChanges: ({ context }) => {
      return context.value !== context.committedValue;
    },
  },
});

const textMachine = textMachineSetup.createMachine({
  id: "textEditor",
  initial: "reading",
  context: {
    committedValue: "",
    value: "",
  },
  states: {
    reading: {
      entry: { type: "logValue" },
      on: {
        "text.edit": { target: "editing" },
      },
    },
    editing: {
      entry: () => console.log("Now editing..."),
      on: {
        "text.change": {
          actions: assign({
            value: ({ event }) => "value" in event ? event.value : "",
          }),
        },
        "text.commit": {
          guard: { type: "hasChanges" },
          actions: assign({
            committedValue: ({ context }) => context.value,
          }),
          target: "reading",
        },
        "text.cancel": {
          actions: assign({
            value: ({ context }) => context.committedValue,
          }),
          target: "reading",
        },
      },
      exit: () => console.log("Stopped editing"),
    },
  },
});

// Create and run the actor
const textActor = createActor(textMachine);

textActor.subscribe((state) => {
  console.log(`State: ${state.value}, Value: "${state.context.value}"`);
});

textActor.start();
// Logs: Current value:
// Logs: State: reading, Value: ""

textActor.send({ type: "text.edit" });
// Logs: Now editing...
// Logs: State: editing, Value: ""

textActor.send({ type: "text.change", value: "Hello" });
// Logs: State: editing, Value: "Hello"

textActor.send({ type: "text.change", value: "Hello World" });
// Logs: State: editing, Value: "Hello World"

textActor.send({ type: "text.commit" });
// Logs: Stopped editing
// Logs: Current value: Hello World
// Logs: State: reading, Value: "Hello World"

textActor.send({ type: "text.edit" });
// Logs: Now editing...
// Logs: State: editing, Value: "Hello World"

textActor.send({ type: "text.change", value: "Hello World!!!" });
// Logs: State: editing, Value: "Hello World!!!"

textActor.send({ type: "text.cancel" });
// Logs: Stopped editing
// Logs: Current value: Hello World
// Logs: State: reading, Value: "Hello World"

textActor.stop();
