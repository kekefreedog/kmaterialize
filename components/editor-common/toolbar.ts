import type { Toolbar } from "../toolbar/toolbar";

/** A toolbar element or an already initialized Kmaterialize Toolbar. */
export type EditorToolbar = HTMLElement|Toolbar;

/** Bind public commands without taking ownership of the Toolbar instance. */
export function bindEditorToolbar(host:HTMLElement, toolbar:EditorToolbar, execute:(command:string, value:string) => void, enabled:(command:string) => boolean):() => void {
    // Resolve the toolbar's element.
    const element = toolbar instanceof HTMLElement ? toolbar : toolbar.el;
    // Remember authored states for disconnection.
    const controls = Array.from(element.querySelectorAll<HTMLElement>("[data-editor-command]"));
    // Preserve attributes owned by this binding.
    const original = controls.map(control => ({control, disabled:control.hasAttribute("disabled")}));
    // Scope all listeners to this connection.
    const controller = new AbortController();
    // Keep command availability synchronized.
    const update = ():void => {
        // Refresh each authored control.
        for(const item of original)
            // Respect application-disabled controls.
            item.control.toggleAttribute("disabled", item.disabled || !enabled(item.control.dataset.editorCommand || ""));
    };
    // Route button and select interactions.
    const handle = (event:Event):void => {
        // Locate the command control.
        const control = (event.target as Element).closest<HTMLElement>("[data-editor-command]");
        // Distinguish native clicks, custom button events, and select changes.
        const valid = control && element.contains(control) && !control.hasAttribute("disabled") &&
            (event.type === "buttonaction" || (event.type === "change" && control instanceof HTMLSelectElement) ||
                (event.type === "click" && control.tagName !== "CRAZY-BUTTON" && !(control instanceof HTMLSelectElement)));
        // Execute supported controls once.
        if(valid){
            // Prevent navigation or form submission.
            event.preventDefault();
            // Invoke the component's public command dispatcher.
            execute(control.dataset.editorCommand || "", control instanceof HTMLSelectElement ? control.value : control.dataset.editorValue || "");
            // Refresh button availability after the command.
            update();
        }
    };
    // Subscribe to each supported interaction.
    for(const name of ["click", "change", "buttonaction"])
        // Register the delegated listener.
        element.addEventListener(name, handle, {signal:controller.signal});
    // React to editing and selection changes.
    host.addEventListener("editorstatechange", update, {signal:controller.signal});
    // Initialize command availability.
    update();
    // Prepare the disconnect operation.
    const result = ():void => {
        // Remove the connection's listeners.
        controller.abort();
        // Restore authored control states.
        for(const item of original)
            // Restore the original disabled attribute.
            item.control.toggleAttribute("disabled", item.disabled);
    };
    // Return result.
    return result;
}
