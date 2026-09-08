/**
 * Loads an optional peer dependency, throwing a clear, actionable error if
 * it isn't installed/available - used by every enhanced-form-input
 * component (Number/IMask, Color/Pickr, Date/air-datepicker, File/FilePond,
 * Select/Tom Select) so a consumer who never touches e.g. the color picker
 * never pays for Pickr in their bundle and never needs it installed.
 *
 * kmaterialize itself has zero runtime JS dependencies besides
 * normalize.css - these five libraries are `peerDependencies` (optional),
 * never bundled, and only ever referenced via `import type` (erased at
 * compile time) plus a real dynamic `import()` at each call site.
 *
 * IMPORTANT: the caller must pass a literal dynamic import, e.g.
 * `() => import('tom-select')` - NOT a variable/computed specifier. Vite,
 * webpack and Rollup all statically scan `import('literal-string')` calls
 * to include the module in their dependency graph (and, for Vite, its dev
 * pre-bundler); an `import(someVariable)` is invisible to that scan, so in
 * a real bundled app it reaches the browser as a bare, unresolved specifier
 * and fails even when the package is installed. Passing the import as a
 * callback keeps each call site's `import('literal')` intact for every
 * bundler to see, while this helper only decides whether/when to call it.
 *
 * Two resolution strategies, tried in order:
 *  1. `await importer()` - works for any bundler (Vite/webpack/rollup/
 *     esbuild) and for our own ESM/CJS builds where the host has the peer
 *     installed as a real node_modules dependency.
 *  2. A global-scope fallback (`window[globalName]`) - the only viable
 *     path for a plain `<script src="materialize.js">` (no-bundler)
 *     consumer, who loads the peer's own CDN UMD build as a separate
 *     `<script>` tag that assigns a global (e.g. `window.TomSelect`). Tried
 *     if the import throws (e.g. a plain <script> page has no module
 *     resolution for bare specifiers at all).
 *
 * If neither resolves, throws naming the missing package AND the CDN
 * global it needs to expose - never fails silently, and never falls back
 * to degraded/no-op behavior a consumer could mistake for "it's disabled".
 */
export interface PeerLoadSpec {
  /** npm package name, e.g. 'tom-select' - used only for messages/caching, not the actual import. */
  specifier: string;
  /** Global name the peer's own CDN UMD build assigns on `window`, e.g. 'TomSelect'. */
  globalName: string;
  /** Human name of the kmaterialize feature requesting it, for the error message. */
  feature: string;
  /** CDN script tag suggestion shown in the error message. */
  cdnHint: string;
}

const _cache = new Map<string, unknown>();

export async function loadPeer<T = unknown>(spec: PeerLoadSpec, importer: () => Promise<unknown>): Promise<T> {
  if (_cache.has(spec.specifier)) return _cache.get(spec.specifier) as T;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await importer();
    const resolved = mod?.default ?? mod;
    _cache.set(spec.specifier, resolved);
    return resolved as T;
  } catch {
    // fall through to the global-scope lookup below
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalScope = typeof window !== 'undefined' ? (window as any) : undefined;
  if (globalScope && globalScope[spec.globalName]) {
    const resolved = globalScope[spec.globalName];
    _cache.set(spec.specifier, resolved);
    return resolved as T;
  }

  throw new Error(
    `kmaterialize's ${spec.feature} requires "${spec.specifier}", which isn't installed/loaded.\n` +
      `- If you're using a bundler: npm/pnpm/yarn install "${spec.specifier}".\n` +
      `- If you're using the plain <script> (no-bundler) build: add\n` +
      `    ${spec.cdnHint}\n` +
      `  before initializing this component, so window.${spec.globalName} is defined.`
  );
}
