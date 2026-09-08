/**
 * UI barrel — import shared primitives from `src/ui` rather than reaching into
 * `src/ui/primitives/*` directly. `tokens.css` and `primitives.css` are imported once,
 * globally, from `src/index.css`.
 */
export * from './primitives';
