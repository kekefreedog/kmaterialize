const _cache = new Map();
export async function loadPeer(spec, importer) {
    if (_cache.has(spec.specifier))
        return _cache.get(spec.specifier);
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await importer();
        const resolved = mod?.default ?? mod;
        _cache.set(spec.specifier, resolved);
        return resolved;
    }
    catch {
        // fall through to the global-scope lookup below
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalScope = typeof window !== 'undefined' ? window : undefined;
    if (globalScope && globalScope[spec.globalName]) {
        const resolved = globalScope[spec.globalName];
        _cache.set(spec.specifier, resolved);
        return resolved;
    }
    throw new Error(`kmaterialize's ${spec.feature} requires "${spec.specifier}", which isn't installed/loaded.\n` +
        `- If you're using a bundler: npm/pnpm/yarn install "${spec.specifier}".\n` +
        `- If you're using the plain <script> (no-bundler) build: add\n` +
        `    ${spec.cdnHint}\n` +
        `  before initializing this component, so window.${spec.globalName} is defined.`);
}
