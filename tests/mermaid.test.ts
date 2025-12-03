import { assertEquals } from "jsr:@std/assert";
import { createMachine } from "../src/mod.ts";
import { toMermaid } from "../src/mermaid.ts";

Deno.test("toMermaid - simple machine", () => {
  const machine = createMachine({
    id: "toggle",
    initial: "inactive",
    states: {
      inactive: {
        on: { TOGGLE: { target: "active" } },
      },
      active: {
        on: { TOGGLE: { target: "inactive" } },
      },
    },
  });

  const diagram = toMermaid(machine);

  // Basic checks for expected content
  assertEquals(diagram.includes("stateDiagram-v2"), true);
  assertEquals(diagram.includes("[*] --> inactive"), true);
  assertEquals(diagram.includes('state "inactive" as inactive'), true);
  assertEquals(diagram.includes('state "active" as active'), true);
  assertEquals(diagram.includes("inactive --> active : TOGGLE"), true);
  assertEquals(diagram.includes("active --> inactive : TOGGLE"), true);
});

Deno.test("toMermaid - compound machine", () => {
  const machine = createMachine({
    initial: "green",
    states: {
      green: {
        on: { TIMER: "yellow" },
      },
      yellow: {
        on: { TIMER: "red" },
      },
      red: {
        initial: "walk",
        states: {
          walk: { on: { WAIT: "wait" } },
          wait: { on: { STOP: "stop" } },
          stop: {},
        },
        on: { TIMER: "green" },
      },
    },
  });

  const diagram = toMermaid(machine);

  assertEquals(diagram.includes("[*] --> green"), true);
  assertEquals(diagram.includes('state "red" as red {'), true);
  assertEquals(diagram.includes("[*] --> red_walk"), true);
  assertEquals(diagram.includes('state "walk" as red_walk'), true);
  assertEquals(diagram.includes("red_walk --> red_wait : WAIT"), true);
});

Deno.test("toMermaid - parallel machine", () => {
  const machine = createMachine({
    initial: "active",
    states: {
      active: {
        type: "parallel",
        states: {
          upload: {
            initial: "idle",
            states: {
              idle: { on: { START: "uploading" } },
              uploading: {},
            },
          },
          download: {
            initial: "idle",
            states: {
              idle: { on: { START: "downloading" } },
              downloading: {},
            },
          },
        },
      },
    },
  });

  const diagram = toMermaid(machine);

  assertEquals(diagram.includes('state "active" as active {'), true);
  assertEquals(diagram.includes('state "upload" as active_upload {'), true);
  assertEquals(diagram.includes("--"), true); // Separator
  assertEquals(diagram.includes('state "download" as active_download {'), true);
});

Deno.test("toMermaid - actions and guards", () => {
  const machine = createMachine({
    initial: "idle",
    states: {
      idle: {
        on: {
          GO: {
            target: "running",
            guard: { type: "canGo" },
            actions: [{ type: "logStart" }],
          },
        },
      },
      running: {},
    },
  });

  const diagram = toMermaid(machine);

  // Check for guard and action in label
  // The implementation formats it as: EVENT [cond] / action
  assertEquals(
    diagram.includes("idle --> running : GO [canGo] / logStart"),
    true,
  );
});

Deno.test("toMermaid - history states", () => {
  const machine = createMachine({
    initial: "main",
    states: {
      main: {
        initial: "a",
        states: {
          a: { on: { NEXT: "b" } },
          b: {},
          hist: { type: "history", target: "a" },
        },
      },
      deep: {
        initial: "wrapper",
        states: {
          wrapper: {
            initial: "inner",
            states: { inner: {} },
          },
          hstar: { type: "history", history: "deep" },
        },
      },
    },
  });

  const diagram = toMermaid(machine);

  // Shallow history
  assertEquals(diagram.includes('state "H" as main_hist'), true);
  assertEquals(diagram.includes("main_hist --> main_a"), true);

  // Deep history
  assertEquals(diagram.includes('state "H*" as deep_hstar'), true);
});

Deno.test("toMermaid - delayed transitions", () => {
  const machine = createMachine({
    initial: "green",
    states: {
      green: {
        after: {
          1000: "yellow",
        },
      },
      yellow: {
        after: {
          500: { target: "red" },
        },
      },
      red: {},
    },
  });

  const diagram = toMermaid(machine);

  assertEquals(diagram.includes("green --> yellow : after 1000"), true);
  assertEquals(diagram.includes("yellow --> red : after 500"), true);
});
