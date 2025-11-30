/**
 * Assign action for updating context
 */

import type {
  ActionContext,
  ActionFunction,
  EventObject,
} from "../core/types.ts";

/**
 * Assigner function type - can return partial context or updater function
 */
export type Assigner<TContext, TEvent extends EventObject> =
  | Partial<TContext>
  | ((args: ActionContext<TContext, TEvent>) => Partial<TContext>)
  | {
    [K in keyof TContext]?:
      | TContext[K]
      | ((args: ActionContext<TContext, TEvent>) => TContext[K]);
  };

/**
 * Create an assign action that updates the context
 *
 * @example
 * ```ts
 * assign({ count: 0 })
 * assign({ count: ({ context }) => context.count + 1 })
 * assign(({ context }) => ({ count: context.count + 1 }))
 * ```
 */
export function assign<TContext extends object, TEvent extends EventObject>(
  assigner: Assigner<TContext, TEvent>,
): ActionFunction<TContext, TEvent> {
  return (args: ActionContext<TContext, TEvent>) => {
    let updates: Partial<TContext>;

    // If assigner is a function, call it to get updates
    if (typeof assigner === "function") {
      updates = assigner(args);
    } else if (typeof assigner === "object") {
      // If assigner is an object, resolve each property
      updates = {} as Partial<TContext>;
      for (const key in assigner) {
        const value = assigner[key];
        if (typeof value === "function") {
          // @ts-ignore - TypeScript has trouble with this pattern
          updates[key] = value(args);
        } else {
          // @ts-ignore
          updates[key] = value;
        }
      }
    } else {
      updates = {};
    }

    // Mutate the context in place (this is intentional for performance)
    // The context object is already a copy in the actor
    Object.assign(args.context as object, updates);
  };
}
