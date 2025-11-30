/**
 * Media player example - demonstrates parallel states
 */

import { createMachine, createActor, assign } from '../src/mod.ts';

// Media player with independent playback and volume controls
const mediaPlayerMachine = createMachine<
  { volume: number; position: number },
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'STOP' }
  | { type: 'VOLUME_UP' }
  | { type: 'VOLUME_DOWN' }
  | { type: 'MUTE' }
  | { type: 'UNMUTE' }
>({
  id: 'mediaPlayer',
  initial: 'active',
  context: {
    volume: 50,
    position: 0,
  },
  states: {
    active: {
      type: 'parallel',
      states: {
        playback: {
          initial: 'stopped',
          states: {
            stopped: {
              entry: () => console.log('⏹️  Stopped'),
              on: {
                PLAY: { target: 'playing' },
              },
            },
            playing: {
              entry: () => console.log('▶️  Playing'),
              on: {
                PAUSE: { target: 'paused' },
                STOP: { target: 'stopped' },
              },
            },
            paused: {
              entry: () => console.log('⏸️  Paused'),
              on: {
                PLAY: { target: 'playing' },
                STOP: { target: 'stopped' },
              },
            },
          },
        },
        volume: {
          initial: 'normal',
          states: {
            normal: {
              entry: ({ context }) => console.log(`🔊 Volume: ${context.volume}%`),
              on: {
                VOLUME_UP: {
                  actions: assign({
                    volume: ({ context }) => Math.min(100, context.volume + 10),
                  }),
                },
                VOLUME_DOWN: {
                  actions: assign({
                    volume: ({ context }) => Math.max(0, context.volume - 10),
                  }),
                },
                MUTE: { target: 'muted' },
              },
            },
            muted: {
              entry: () => console.log('🔇 Muted'),
              on: {
                UNMUTE: { target: 'normal' },
                VOLUME_UP: { target: 'normal' },
                VOLUME_DOWN: { target: 'normal' },
              },
            },
          },
        },
      },
    },
  },
});

// Create and run the actor
const actor = createActor(mediaPlayerMachine);

actor.subscribe((state) => {
  console.log('State:', state.value);
  console.log('Context:', state.context);
  console.log('---');
});

actor.start();

// Demonstrate independent control
setTimeout(() => {
  console.log('\n▶️ Starting playback...');
  actor.send({ type: 'PLAY' });
}, 500);

setTimeout(() => {
  console.log('\n🔊 Increasing volume...');
  actor.send({ type: 'VOLUME_UP' });
}, 1000);

setTimeout(() => {
  console.log('\n⏸️ Pausing playback...');
  actor.send({ type: 'PAUSE' });
}, 1500);

setTimeout(() => {
  console.log('\n🔇 Muting...');
  actor.send({ type: 'MUTE' });
}, 2000);

setTimeout(() => {
  console.log('\n▶️ Resuming playback...');
  actor.send({ type: 'PLAY' });
}, 2500);

setTimeout(() => {
  console.log('\n🔊 Unmuting...');
  actor.send({ type: 'UNMUTE' });
}, 3000);

setTimeout(() => {
  console.log('\n⏹️ Stopping...');
  actor.send({ type: 'STOP' });
}, 3500);

// Stop after demo
setTimeout(() => {
  actor.stop();
  console.log('\n✨ Demo complete');
}, 4000);
