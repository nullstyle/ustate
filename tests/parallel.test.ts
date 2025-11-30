/**
 * Tests for parallel states
 */

import { assertEquals } from 'jsr:@std/assert';
import { createMachine, createActor, assign } from '../src/mod.ts';

Deno.test('parallel - creates machine with parallel states', () => {
  const machine = createMachine({
    id: 'parallel',
    initial: 'active',
    states: {
      active: {
        type: 'parallel',
        states: {
          upload: {
            initial: 'idle',
            states: {
              idle: {},
              uploading: {},
            },
          },
          download: {
            initial: 'idle',
            states: {
              idle: {},
              downloading: {},
            },
          },
        },
      },
    },
  });

  assertEquals(machine.config.id, 'parallel');
});

Deno.test('parallel - starts with all parallel regions in initial state', () => {
  const machine = createMachine({
    initial: 'active',
    states: {
      active: {
        type: 'parallel',
        states: {
          upload: {
            initial: 'idle',
            states: {
              idle: {},
              uploading: {},
            },
          },
          download: {
            initial: 'idle',
            states: {
              idle: {},
              downloading: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  const state = actor.getSnapshot();
  assertEquals(state.value, {
    active: {
      upload: 'idle',
      download: 'idle',
    },
  });
  assertEquals(state.matches('active'), true);
  assertEquals(state.matches('active.upload'), true);
  assertEquals(state.matches('active.download'), true);
  assertEquals(state.matches('active.upload.idle'), true);
  assertEquals(state.matches('active.download.idle'), true);
});

Deno.test('parallel - transitions in one region do not affect others', () => {
  const machine = createMachine<
    Record<string, never>,
    { type: 'START_UPLOAD' } | { type: 'START_DOWNLOAD' }
  >({
    initial: 'active',
    states: {
      active: {
        type: 'parallel',
        states: {
          upload: {
            initial: 'idle',
            states: {
              idle: {
                on: {
                  START_UPLOAD: { target: 'uploading' },
                },
              },
              uploading: {},
            },
          },
          download: {
            initial: 'idle',
            states: {
              idle: {
                on: {
                  START_DOWNLOAD: { target: 'downloading' },
                },
              },
              downloading: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // Start upload
  actor.send({ type: 'START_UPLOAD' });
  let state = actor.getSnapshot();
  assertEquals(state.value, {
    active: {
      upload: 'uploading',
      download: 'idle',
    },
  });

  // Start download
  actor.send({ type: 'START_DOWNLOAD' });
  state = actor.getSnapshot();
  assertEquals(state.value, {
    active: {
      upload: 'uploading',
      download: 'downloading',
    },
  });
});

Deno.test('parallel - executes entry actions for all parallel regions', () => {
  const events: string[] = [];

  const machine = createMachine({
    initial: 'active',
    states: {
      active: {
        type: 'parallel',
        entry: () => events.push('enter:active'),
        states: {
          region1: {
            initial: 'idle',
            entry: () => events.push('enter:region1'),
            states: {
              idle: {
                entry: () => events.push('enter:region1.idle'),
              },
            },
          },
          region2: {
            initial: 'idle',
            entry: () => events.push('enter:region2'),
            states: {
              idle: {
                entry: () => events.push('enter:region2.idle'),
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  // All regions should have their entry actions executed
  assertEquals(events.includes('enter:active'), true);
  assertEquals(events.includes('enter:region1'), true);
  assertEquals(events.includes('enter:region1.idle'), true);
  assertEquals(events.includes('enter:region2'), true);
  assertEquals(events.includes('enter:region2.idle'), true);
});

Deno.test('parallel - context is shared across parallel regions', () => {
  const machine = createMachine<
    { uploadCount: number; downloadCount: number },
    { type: 'UPLOAD' } | { type: 'DOWNLOAD' }
  >({
    initial: 'active',
    context: { uploadCount: 0, downloadCount: 0 },
    states: {
      active: {
        type: 'parallel',
        states: {
          upload: {
            initial: 'idle',
            states: {
              idle: {
                on: {
                  UPLOAD: {
                    actions: assign({
                      uploadCount: ({ context }) => context.uploadCount + 1,
                    }),
                  },
                },
              },
            },
          },
          download: {
            initial: 'idle',
            states: {
              idle: {
                on: {
                  DOWNLOAD: {
                    actions: assign({
                      downloadCount: ({ context }) => context.downloadCount + 1,
                    }),
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  actor.send({ type: 'UPLOAD' });
  assertEquals(actor.getSnapshot().context.uploadCount, 1);
  assertEquals(actor.getSnapshot().context.downloadCount, 0);

  actor.send({ type: 'DOWNLOAD' });
  assertEquals(actor.getSnapshot().context.uploadCount, 1);
  assertEquals(actor.getSnapshot().context.downloadCount, 1);

  actor.send({ type: 'UPLOAD' });
  assertEquals(actor.getSnapshot().context.uploadCount, 2);
  assertEquals(actor.getSnapshot().context.downloadCount, 1);
});

Deno.test('parallel - can check event handling in any region', () => {
  const machine = createMachine<
    Record<string, never>,
    { type: 'EVENT1' } | { type: 'EVENT2' } | { type: 'EVENT3' }
  >({
    initial: 'active',
    states: {
      active: {
        type: 'parallel',
        states: {
          region1: {
            initial: 'idle',
            states: {
              idle: {
                on: {
                  EVENT1: { target: 'active' },
                },
              },
              active: {},
            },
          },
          region2: {
            initial: 'idle',
            states: {
              idle: {
                on: {
                  EVENT2: { target: 'active' },
                },
              },
              active: {},
            },
          },
        },
      },
    },
  });

  const actor = createActor(machine);
  actor.start();

  const state = actor.getSnapshot();
  assertEquals(state.can({ type: 'EVENT1' }), true);
  assertEquals(state.can({ type: 'EVENT2' }), true);
  assertEquals(state.can({ type: 'EVENT3' }), false);
});
