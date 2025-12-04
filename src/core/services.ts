/**
 * System services for non-deterministic operations
 *
 * This module centralizes all sources of non-determinism (like random ID generation)
 * to make the state machine library testable and support deterministic replay.
 *
 * Uses @nullstyle/urand for high-quality, seedable random number generation.
 */

import { Prng } from "@nullstyle/urand";

/**
 * System services interface
 *
 * Provides abstractions over non-deterministic operations that can be
 * replaced with deterministic implementations for testing or replay.
 */
export interface SystemServices {
  /**
   * Generate a unique ID with an optional prefix
   *
   * @param prefix - Optional prefix for the generated ID
   * @returns A unique identifier string
   */
  generateId(prefix?: string): string;

  /**
   * Get the current timestamp in milliseconds
   *
   * @returns Current time as milliseconds since epoch
   */
  now(): number;

  /**
   * Cleanup any resources held by this services instance
   */
  dispose?(): void;
}

// Global PRNG instance for default services
let globalPrng: Prng | null = null;

function getGlobalPrng(): Prng {
  if (!globalPrng) {
    // Seed with current time for non-deterministic behavior
    globalPrng = Prng.create(
      BigInt(Date.now()) ^ BigInt(Math.floor(Math.random() * 0xFFFFFFFF)),
    );
  }
  return globalPrng;
}

/**
 * Default ID generator using @nullstyle/urand
 */
function defaultGenerateId(prefix?: string): string {
  const rng = getGlobalPrng();
  const randomPart = rng.nextU64().toString(36).slice(0, 9);
  return prefix ? `${prefix}-${randomPart}` : randomPart;
}

/**
 * Default timestamp function using Date.now()
 */
function defaultNow(): number {
  return Date.now();
}

/**
 * Default system services implementation
 *
 * Uses standard non-deterministic functions for production use.
 */
export const defaultServices: SystemServices = {
  generateId: defaultGenerateId,
  now: defaultNow,
};

/**
 * Create a deterministic services implementation for testing
 *
 * @param seed - Optional seed for reproducible ID generation
 * @returns SystemServices with deterministic behavior
 *
 * @example
 * ```ts
 * const services = createDeterministicServices(12345);
 * console.log(services.generateId('actor')); // Always produces same sequence
 * services.dispose?.(); // Clean up when done
 * ```
 */
export function createDeterministicServices(seed?: number): SystemServices {
  const rng = Prng.create(BigInt(seed ?? 0));
  let counter = 0;
  const startTime = seed ?? 0;

  return {
    generateId(prefix?: string): string {
      const id = rng.nextU64().toString(36).slice(0, 7).padStart(7, "0");
      counter++;
      return prefix ? `${prefix}-${id}` : id;
    },

    now(): number {
      // Return incrementing timestamps starting from seed
      return startTime + counter * 100;
    },

    dispose(): void {
      rng.destroy();
    },
  };
}

/**
 * Create a counter-based services implementation
 *
 * Useful for tests where you want simple, predictable IDs.
 *
 * @param startCounter - Starting counter value (default: 0)
 * @returns SystemServices with counter-based IDs
 *
 * @example
 * ```ts
 * const services = createCounterServices();
 * console.log(services.generateId('actor')); // 'actor-0'
 * console.log(services.generateId('actor')); // 'actor-1'
 * ```
 */
export function createCounterServices(startCounter = 0): SystemServices {
  let counter = startCounter;
  let timeCounter = 0;

  return {
    generateId(prefix?: string): string {
      const id = String(counter++);
      return prefix ? `${prefix}-${id}` : id;
    },

    now(): number {
      return timeCounter++ * 1000;
    },
  };
}

// Global services instance (can be replaced for testing)
let globalServices: SystemServices = defaultServices;

/**
 * Get the current global services instance
 */
export function getServices(): SystemServices {
  return globalServices;
}

/**
 * Set the global services instance
 *
 * @param services - The services implementation to use globally
 * @returns The previous services instance (for restoration)
 *
 * @example
 * ```ts
 * // In a test
 * const original = setServices(createCounterServices());
 * try {
 *   // Run test with deterministic services
 * } finally {
 *   setServices(original);
 * }
 * ```
 */
export function setServices(services: SystemServices): SystemServices {
  const previous = globalServices;
  globalServices = services;
  return previous;
}

/**
 * Reset services to default implementation
 */
export function resetServices(): void {
  globalServices = defaultServices;
}

/**
 * Run a function with temporary services
 *
 * @param services - Services to use during execution
 * @param fn - Function to execute
 * @returns The result of the function
 *
 * @example
 * ```ts
 * const result = withServices(createCounterServices(), () => {
 *   const actor = createActor(machine);
 *   return actor.getSnapshot();
 * });
 * ```
 */
export function withServices<T>(services: SystemServices, fn: () => T): T {
  const previous = setServices(services);
  try {
    return fn();
  } finally {
    setServices(previous);
  }
}

/**
 * Run an async function with temporary services
 *
 * @param services - Services to use during execution
 * @param fn - Async function to execute
 * @returns Promise resolving to the function's result
 */
export async function withServicesAsync<T>(
  services: SystemServices,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = setServices(services);
  try {
    return await fn();
  } finally {
    setServices(previous);
  }
}
