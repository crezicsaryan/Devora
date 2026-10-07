/**
 * Route-handler parameter typing.
 *
 * Next generates a global `RouteContext<'/path/[param]'>` helper during
 * `next dev` / `next build`, but that ambient type does not exist for a plain
 * `tsc` run. Declaring the promise-wrapped params shape ourselves keeps the
 * handlers type-safe in both worlds (and stays assignable to Next's own type).
 */

export type RouteParams<T extends Record<string, string>> = {
  params: Promise<T>;
};
