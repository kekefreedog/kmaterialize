'use strict';

var tippy = require('tippy.js');

/** Shared tooltip configuration for direct imports and lazy component tooltips. */
function createTooltipWith(factory, fill, target, style, options = {}) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const instance = factory(target, {
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
    return createTooltipWith(tippy, tippy.animateFill, target, style, typeof styleOrOptions === 'string' ? options : styleOrOptions);
}

exports.createTooltip = createTooltip;
