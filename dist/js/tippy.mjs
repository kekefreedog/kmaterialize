import tippy, { animateFill } from 'tippy.js';

/** Shared tooltip configuration for direct imports and lazy component tooltips. */
function createTooltipWith(factory, fill, target, style, options = {}) {
    // Dynamic imports of CommonJS builds can wrap Tippy in one or more
    // default exports. Static ESM imports and browser globals are callable already.
    let resolved = factory;
    const seen = new Set();
    while (resolved && typeof resolved === "object" && !seen.has(resolved)) {
        seen.add(resolved);
        const module = resolved;
        fill ??= module.animateFill;
        resolved = module.default;
    }
    if (typeof resolved !== "function") {
        throw new TypeError('kmaterialize: "tippy.js" did not export a tooltip function.');
    }
    const create = resolved;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const instance = create(target, {
        animateFill: !reducedMotion && !!fill,
        arrow: false,
        plugins: fill ? [fill] : [],
        placement: "auto",
        theme: style === "material" ? "materialize" : "",
        allowHTML: false,
        ...options,
        ...(reducedMotion
            ? { animateFill: false, animation: false, duration: 0 }
            : {}),
    });
    // Escape dismisses a focused tooltip without moving keyboard focus.
    const escape = (event) => {
        if (event.key === "Escape")
            instance.hide();
    };
    document.addEventListener("keydown", escape);
    const destroy = instance.destroy.bind(instance);
    instance.destroy = () => {
        document.removeEventListener("keydown", escape);
        destroy();
    };
    return instance;
}

function createTooltip(target, styleOrOptions = 'classic', options = {}) {
    const style = typeof styleOrOptions === 'string' ? styleOrOptions : 'classic';
    return createTooltipWith(tippy, animateFill, target, style, typeof styleOrOptions === 'string' ? options : styleOrOptions);
}

export { createTooltip };
