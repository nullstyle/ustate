/**
 * State value utilities for hierarchical and parallel states
 */

import type { StateValue } from "./types.ts";

/**
 * Convert a state path array to a state value
 * ['parent', 'child'] -> { parent: 'child' }
 */
export function pathToStateValue(path: string[]): StateValue {
  if (path.length === 0) return "";
  if (path.length === 1) return path[0];

  const [first, ...rest] = path;
  return { [first]: pathToStateValue(rest) };
}

/**
 * Convert a state value to path array(s)
 * 'active' -> [['active']]
 * { parent: 'child' } -> [['parent', 'child']]
 * { a: 'x', b: 'y' } -> [['a', 'x'], ['b', 'y']] (parallel)
 */
export function stateValueToPaths(value: StateValue): string[][] {
  if (typeof value === "string") {
    return [[value]];
  }

  if (Array.isArray(value)) {
    // Parallel states represented as array
    return value.flatMap((v) => stateValueToPaths(v));
  }

  // Object representing compound state
  const paths: string[][] = [];
  for (const [key, childValue] of Object.entries(value)) {
    const childPaths = stateValueToPaths(childValue);
    for (const childPath of childPaths) {
      paths.push([key, ...childPath]);
    }
  }
  return paths;
}

/**
 * Get the top-level state from a state value
 */
export function getTopLevelState(value: StateValue): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    // For parallel states, return the first one
    return getTopLevelState(value[0]);
  }

  // For compound states, return the parent key
  const keys = Object.keys(value);
  return keys[0];
}

/**
 * Check if two state values match
 */
export function matchesStateValue(
  current: StateValue,
  test: StateValue | string,
): boolean {
  // Convert string test to proper format
  if (typeof test === "string") {
    // Handle dot notation like 'parent.child'
    if (test.includes(".")) {
      const testPath = test.split(".");
      const currentPaths = stateValueToPaths(current);
      return currentPaths.some((path) => pathsMatch(path, testPath));
    }

    // Check if it matches any path in current state
    const currentPaths = stateValueToPaths(current);
    return currentPaths.some((path) => path.includes(test));
  }

  // Both are complex state values
  const currentPaths = stateValueToPaths(current);
  const testPaths = stateValueToPaths(test);

  // Check if all test paths are present in current paths
  return testPaths.every((testPath) =>
    currentPaths.some((currentPath) => pathsMatch(currentPath, testPath))
  );
}

/**
 * Check if a current path matches or contains a test path
 */
function pathsMatch(currentPath: string[], testPath: string[]): boolean {
  if (testPath.length > currentPath.length) return false;

  for (let i = 0; i < testPath.length; i++) {
    if (currentPath[i] !== testPath[i]) return false;
  }

  return true;
}

/**
 * Deep merge two state value objects
 */
function deepMergeStateValues(
  target: Record<string, StateValue>,
  source: Record<string, StateValue>,
): Record<string, StateValue> {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (key in result) {
      const targetValue = result[key];
      // Both are objects - merge recursively
      if (
        typeof targetValue === "object" &&
        !Array.isArray(targetValue) &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        result[key] = deepMergeStateValues(
          targetValue as Record<string, StateValue>,
          value as Record<string, StateValue>,
        );
      } else if (Array.isArray(targetValue) || Array.isArray(value)) {
        const t = Array.isArray(targetValue) ? targetValue : [targetValue];
        const v = Array.isArray(value) ? value : [value];
        result[key] = mergeStateValues(...t, ...v);
      } else {
        // Otherwise, source wins
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Merge parallel state values
 */
export function mergeStateValues(...values: StateValue[]): StateValue {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];

  // If all are strings, just return the first (shouldn't happen in parallel)
  if (values.every((v) => typeof v === "string")) {
    return values[0];
  }

  // Deep merge into an object
  let merged: Record<string, StateValue> = {};

  for (const value of values) {
    if (typeof value === "string") {
      merged[value] = value;
    } else if (Array.isArray(value)) {
      const subMerged = mergeStateValues(...value);
      if (typeof subMerged === "string") {
        merged[subMerged] = subMerged;
      } else {
        merged = deepMergeStateValues(
          merged,
          subMerged as Record<string, StateValue>,
        );
      }
    } else {
      merged = deepMergeStateValues(
        merged,
        value as Record<string, StateValue>,
      );
    }
  }

  return merged;
}

/**
 * Convert state value to string representation
 */
export function stateValueToString(value: StateValue): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(stateValueToString).join(" | ");
  }

  const entries = Object.entries(value);
  return entries.map(([key, val]) => {
    const childStr = stateValueToString(val);
    return `${key}.${childStr}`;
  }).join(" | ");
}

/**
 * Get the sub-state value for a specific key
 */
export function getSubStateValue(
  value: StateValue,
  key: string,
): StateValue | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return (value as Record<string, StateValue>)[key];
}

/**
 * Get the history value (shallow or deep)
 */
export function getHistoryValue(
  historyValue: StateValue,
  type: "shallow" | "deep",
): StateValue {
  if (type === "deep") {
    return historyValue;
  }

  // Shallow history
  if (typeof historyValue === "string") {
    return historyValue;
  }

  if (Array.isArray(historyValue)) {
    return historyValue.map((v) => getHistoryValue(v, "shallow"));
  }

  if (typeof historyValue === "object" && historyValue !== null) {
    const keys = Object.keys(historyValue);
    if (keys.length === 0) return historyValue;

    // If multiple keys (parallel state), apply shallow to each
    if (keys.length > 1) {
      const result: Record<string, StateValue> = {};
      for (const key of keys) {
        const subValue = (historyValue as Record<string, StateValue>)[key];
        result[key] = getHistoryValue(subValue, "shallow");
      }
      return result;
    }

    // Single key (compound state)
    // Return the key itself (the active child state name)
    return keys[0];
  }

  return historyValue;
}
