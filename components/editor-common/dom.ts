/** Create editor UI without interpreting document content as HTML. */
export function editorElement<K extends keyof HTMLElementTagNameMap>(tag:K, className:string = "", text:string = ""):HTMLElementTagNameMap[K] {
    // Prepare result.
    const result = document.createElement(tag);
    // Set the component class.
    result.className = className;
    // Insert literal text only.
    result.textContent = text;
    // Return result.
    return result;
}

/** Monotonic identifiers do not require a secure browsing context. */
let sequence = 0;

export function editorId(prefix:string):string {
    // Advance the shared sequence.
    sequence++;
    // Prepare result.
    const result = `${prefix}-${Date.now().toString(36)}-${sequence}`;
    // Return result.
    return result;
}
