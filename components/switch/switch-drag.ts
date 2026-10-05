/** Continuous pointer dragging for native-checkbox Material switches. */
let initialized = false;

interface SwitchGesture {
    input:HTMLInputElement;
    lever:HTMLElement;
    pointerId:number;
    startX:number;
    startY:number;
    checked:boolean;
    travel:number;
    direction:number;
    progress:number;
    dragging:boolean;
    canceled:boolean;
}

/** Install delegated behavior once, including switches inserted later. */
export function initSwitchDragging() {

    if(typeof document === "undefined" || initialized)
        return;

    initialized = true;
    let gesture:SwitchGesture|null = null;
    let suppressedClick:{input:HTMLInputElement; lever:HTMLElement; until:number}|null = null;

    const setProgress = (clientX:number) => {

        const progress = Math.max(0, Math.min(1,
            Number(gesture.checked) + (clientX - gesture.startX) * gesture.direction / gesture.travel
        ));
        gesture.progress = progress;
        gesture.lever.style.setProperty("--switch-drag-progress", String(progress));
        gesture.lever.style.setProperty("--switch-drag-percent", `${progress * 100}%`);
        gesture.lever.classList.add("is-dragging");
        gesture.lever.classList.toggle("is-drag-on", progress >= 0.5);

    };

    const finish = (commit:boolean, canceled = false) => {

        if(!gesture)
            return;

        const current = gesture;
        gesture = null;
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", release, true);
        document.removeEventListener("pointercancel", cancel, true);
        document.removeEventListener("keydown", keydown, true);
        document.removeEventListener("reset", reset, true);
        current.lever.removeEventListener("lostpointercapture", cancel);
        window.removeEventListener("blur", cancel);
        window.removeEventListener("resize", cancel);

        if(current.dragging || current.canceled || canceled)
            suppressedClick = {input: current.input, lever: current.lever, until: Date.now() + 500};

        current.lever.classList.remove("is-dragging", "is-drag-on");
        current.lever.style.removeProperty("--switch-drag-progress");
        current.lever.style.removeProperty("--switch-drag-percent");
        if(current.lever.hasPointerCapture(current.pointerId))
            current.lever.releasePointerCapture(current.pointerId);

        // Native activation preserves canceled clicks, input/change events, and form behavior.
        if(commit && current.dragging && !current.canceled && current.input.isConnected &&
            !current.input.matches(":disabled") && current.input.checked === current.checked &&
            current.input.checked !== (current.progress >= 0.5))
            current.input.click();

    };

    const move = (event:PointerEvent) => {

        if(!gesture || event.pointerId !== gesture.pointerId || gesture.canceled)
            return;

        if(!gesture.input.isConnected || !gesture.lever.isConnected ||
            gesture.input.matches(":disabled") || gesture.input.checked !== gesture.checked){
            finish(false, true);
            return;
        }

        if(!gesture.dragging){
            const dx = Math.abs(event.clientX - gesture.startX);
            const dy = Math.abs(event.clientY - gesture.startY);
            if(Math.max(dx, dy) < 4)
                return;
            if(dy > dx){
                gesture.canceled = true;
                return;
            }

            gesture.dragging = true;
            gesture.input.focus({preventScroll: true});
            try {
                gesture.lever.setPointerCapture(event.pointerId);
            }catch{
                // Synthetic pointers may not own capture; document listeners still clean up.
            }
        }

        event.preventDefault();
        setProgress(event.clientX);

    };

    const release = (event:PointerEvent) => {

        if(!gesture || event.pointerId !== gesture.pointerId)
            return;
        if(gesture.dragging && !gesture.canceled)
            setProgress(event.clientX);
        finish(true);

    };

    const cancel = (event:Event) => {

        if(event instanceof PointerEvent && gesture && event.pointerId !== gesture.pointerId)
            return;
        finish(false, true);

    };

    const keydown = (event:KeyboardEvent) => {

        if(event.key === "Escape"){
            event.preventDefault();
            finish(false, true);
        }

    };

    const reset = (event:Event) => {

        if(event.target === gesture?.input.form)
            finish(false, true);

    };

    document.addEventListener("pointerdown", event => {

        if(!event.isPrimary || event.button !== 0)
            return;
        finish(false, true);
        suppressedClick = null;
        if(event.defaultPrevented || !(event.target instanceof Element))
            return;

        const lever = event.target.closest<HTMLElement>(".switch label .lever");
        const input = lever?.previousElementSibling;
        if(!lever || !(input instanceof HTMLInputElement) || input.type !== "checkbox" || input.matches(":disabled"))
            return;

        const rect = lever.getBoundingClientRect();
        const travel = rect.width - rect.height;
        if(travel <= 0)
            return;

        gesture = {
            input, lever, pointerId: event.pointerId,
            startX: event.clientX, startY: event.clientY,
            checked: input.checked, travel,
            direction: getComputedStyle(lever).direction === "rtl" ? -1 : 1,
            progress: Number(input.checked), dragging: false, canceled: false,
        };
        document.addEventListener("pointermove", move, {capture: true, passive: false});
        document.addEventListener("pointerup", release, true);
        document.addEventListener("pointercancel", cancel, true);
        document.addEventListener("keydown", keydown, true);
        document.addEventListener("reset", reset, true);
        lever.addEventListener("lostpointercapture", cancel);
        window.addEventListener("blur", cancel);
        window.addEventListener("resize", cancel);

    });

    document.addEventListener("click", event => {

        // Ignore only the pointer click following a drag. Keyboard and native .click() stay intact.
        if(!suppressedClick || event.detail === 0)
            return;
        const {input, lever, until} = suppressedClick;
        if(Date.now() > until){
            suppressedClick = null;
            return;
        }
        if(event.target === input || event.composedPath().includes(lever)){
            suppressedClick = null;
            event.preventDefault();
            event.stopImmediatePropagation();
        }

    }, true);

}
