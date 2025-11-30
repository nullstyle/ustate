/**
 * Traffic light example - demonstrates hierarchical states
 */

import { createMachine, createActor } from '../src/mod.ts';

// Traffic light with pedestrian crossing
const trafficLightMachine = createMachine<
  Record<string, never>,
  | { type: 'TIMER' }
  | { type: 'PEDESTRIAN_BUTTON' }
  | { type: 'PEDESTRIAN_TIMER' }
>({
  id: 'trafficLight',
  initial: 'green',
  states: {
    green: {
      entry: () => console.log('🟢 Green light - Cars go'),
      on: {
        TIMER: { target: 'yellow' },
        PEDESTRIAN_BUTTON: { target: 'pedestrianCrossing' },
      },
    },
    yellow: {
      entry: () => console.log('🟡 Yellow light - Slow down'),
      on: {
        TIMER: { target: 'red' },
      },
    },
    red: {
      entry: () => console.log('🔴 Red light - Cars stop'),
      on: {
        TIMER: { target: 'green' },
      },
    },
    pedestrianCrossing: {
      entry: () => console.log('🚶 Pedestrian crossing mode'),
      initial: 'stopping',
      states: {
        stopping: {
          entry: () => console.log('  🟡 Yellow - Cars prepare to stop'),
          on: {
            PEDESTRIAN_TIMER: { target: 'walking' },
          },
        },
        walking: {
          entry: () => console.log('  🚶 Walk signal - Pedestrians cross'),
          on: {
            PEDESTRIAN_TIMER: { target: 'flashing' },
          },
        },
        flashing: {
          entry: () => console.log('  ⚠️  Flashing - Finish crossing'),
          on: {
            PEDESTRIAN_TIMER: { target: 'complete' },
          },
        },
        complete: {
          entry: () => console.log('  ✅ Crossing complete'),
          on: {
            PEDESTRIAN_TIMER: { target: 'green' },
          },
        },
      },
    },
  },
});

// Create and run the actor
const actor = createActor(trafficLightMachine);

actor.subscribe((state) => {
  console.log('Current state:', state.value);
});

actor.start();

// Normal traffic flow
setTimeout(() => actor.send({ type: 'TIMER' }), 1000);
setTimeout(() => actor.send({ type: 'TIMER' }), 2000);

// Pedestrian button pressed
setTimeout(() => actor.send({ type: 'PEDESTRIAN_BUTTON' }), 3000);

// Pedestrian crossing sequence
setTimeout(() => actor.send({ type: 'PEDESTRIAN_TIMER' }), 4000);
setTimeout(() => actor.send({ type: 'PEDESTRIAN_TIMER' }), 5000);
setTimeout(() => actor.send({ type: 'PEDESTRIAN_TIMER' }), 6000);
setTimeout(() => actor.send({ type: 'PEDESTRIAN_TIMER' }), 7000);

// Stop after demo
setTimeout(() => {
  actor.stop();
  console.log('\n✨ Demo complete');
}, 8000);
