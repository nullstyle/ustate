import type {
  Machine,
  StateNodeConfig,
  TransitionDefinition,
} from "./core/types.ts";

/**
 * Sanitizes a string for use as a Mermaid identifier
 */
function sanitizeId(id: string): string {
  // Replace dots (hierarchy separator) and other non-alphanumeric chars with underscore
  return id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/\./g, "_");
}

/**
 * Escapes label text for Mermaid
 */
function escapeLabel(text: string): string {
  return text.replace(/"/g, "'");
}

/**
 * Converts a ustate Machine to a Mermaid stateDiagram-v2 string
 *
 * @param machine The machine to visualize
 * @returns A string containing the Mermaid diagram definition
 */
export function toMermaid(machine: Machine<any, any>): string {
  const lines: string[] = ["stateDiagram-v2"];
  const config = machine.config;
  const allPaths = new Set<string>();

  // First pass: collect all valid state paths to assist with target resolution
  function collectPaths(
    node: StateNodeConfig<any, any>,
    currentPath: string[],
  ) {
    allPaths.add(currentPath.join("."));
    if (node.states) {
      for (const [key, child] of Object.entries(node.states)) {
        collectPaths(child, [...currentPath, key]);
      }
    }
  }

  if (config.states) {
    for (const [key, node] of Object.entries(config.states)) {
      collectPaths(node, [key]);
    }
  }

  /**
   * Resolves a target string to a Mermaid node ID
   */
  function resolveTarget(target: string, contextPath: string[]): string {
    // 1. Handle absolute IDs
    if (target.startsWith("#")) {
      return sanitizeId(target.slice(1));
    }

    // 2. Handle dot-notation paths (assume absolute if in map, or check relative?)
    // If it exactly matches a known path, use it.
    if (allPaths.has(target)) {
      return sanitizeId(target);
    }

    // 3. Resolve relative to context
    // We search up the ancestry stack
    let searchPath = [...contextPath];

    // Start checking from siblings, then parent's siblings, etc.
    // contextPath includes the current state node.
    // The transition is on this node.
    // Siblings are children of the parent.
    // So we start by popping the current node to get parent scope.
    searchPath.pop();

    while (true) {
      const prefix = searchPath.join(".");
      const candidate = prefix ? `${prefix}.${target}` : target;

      if (allPaths.has(candidate)) {
        return sanitizeId(candidate);
      }

      if (searchPath.length === 0) break;
      searchPath.pop();
    }

    // Fallback: just sanitize what we have (best effort)
    return sanitizeId(target);
  }

  function processState(
    name: string,
    node: StateNodeConfig<any, any>,
    parentId: string | null,
    path: string[],
  ) {
    const id = parentId ? `${parentId}_${sanitizeId(name)}` : sanitizeId(name);
    const label = escapeLabel(name);

    // Determine state type and render body
    const isParallel = node.type === "parallel";
    const isHistory = node.type === "history";
    const isCompound = !!node.states && Object.keys(node.states).length > 0;

    if (isHistory) {
      const historyLabel = node.history === "deep" ? "H*" : "H";
      lines.push(`  state "${historyLabel}" as ${id}`);

      if (node.target) {
        const targetId = resolveTarget(node.target, path);
        lines.push(`  ${id} --> ${targetId}`);
      }
    } else if (isParallel) {
      lines.push(`  state "${label}" as ${id} {`);
      // lines.push(`    direction LR`); // Optional: usually parallel looks better LR

      const childKeys = Object.keys(node.states || {});
      childKeys.forEach((key, index) => {
        const child = node.states![key];
        processState(key, child, id, [...path, key]);

        // Add concurrency separator if not the last region
        if (index < childKeys.length - 1) {
          lines.push("    --");
        }
      });
      lines.push(`  }`);
    } else if (isCompound) {
      lines.push(`  state "${label}" as ${id} {`);

      // Initial state transition
      if (node.initial) {
        const initialTargetId = `${id}_${sanitizeId(node.initial)}`;
        lines.push(`    [*] --> ${initialTargetId}`);
      }

      // Process children
      if (node.states) {
        for (const [childName, childNode] of Object.entries(node.states)) {
          processState(childName, childNode, id, [...path, childName]);
        }
      }

      lines.push(`  }`);
    } else {
      // Atomic state
      lines.push(`  state "${label}" as ${id}`);
    }

    // Render Transitions
    if (node.on) {
      for (const [event, transition] of Object.entries(node.on)) {
        if (transition) {
          processTransition(id, event, transition, node, path);
        }
      }
    }

    // Render Always (eventless) transitions
    if (node.always) {
      processTransition(id, "(always)", node.always, node, path);
    }

    // Render Delayed transitions
    if (node.after) {
      for (const [delay, transition] of Object.entries(node.after)) {
        if (transition) {
          processTransition(id, `after ${delay}`, transition, node, path);
        }
      }
    }

    // Render Invocations (visualized as notes or comments, or special labels)
    if (node.invoke) {
      const invokes = Array.isArray(node.invoke) ? node.invoke : [node.invoke];
      invokes.forEach((invoke) => {
        const src = typeof invoke.src === "string"
          ? invoke.src
          : "callback/promise";
        // Mermaid note syntax
        lines.push(`  note right of ${id}`);
        lines.push(`    Invoke: ${src}`);
        lines.push(`  end note`);
      });
    }
  }

  function processTransition(
    sourceId: string,
    event: string,
    transition: TransitionDefinition<any, any>,
    sourceNode: StateNodeConfig<any, any>,
    sourcePath: string[],
  ) {
    const transitions = Array.isArray(transition) ? transition : [transition];

    transitions.forEach((t) => {
      let target: string | undefined;
      let label = event;

      if (typeof t === "string") {
        target = t;
      } else {
        target = t.target;
        // Append guard info
        if (t.guard) {
          const guardName = typeof t.guard === "function"
            ? "cond"
            : t.guard.type;
          label += ` [${guardName}]`;
        }
        // Append action info (optional, can get cluttered)
        if (t.actions) {
          const actions = Array.isArray(t.actions) ? t.actions : [t.actions];
          const actionNames = actions.map((a) =>
            typeof a === "function" ? "action" : a.type
          ).join(", ");
          label += ` / ${actionNames}`;
        }
      }

      if (target) {
        const targetId = resolveTarget(target, sourcePath);
        lines.push(`  ${sourceId} --> ${targetId} : ${label}`);
      } else {
        // Self-transition or internal transition
        lines.push(`  ${sourceId} --> ${sourceId} : ${label}`);
      }
    });
  }

  // Start processing root
  // Initial state for root
  if (config.initial) {
    lines.push(`  [*] --> ${sanitizeId(config.initial)}`);
  }

  if (config.states) {
    for (const [name, node] of Object.entries(config.states)) {
      processState(name, node, null, [name]);
    }
  }

  return lines.join("\n");
}
