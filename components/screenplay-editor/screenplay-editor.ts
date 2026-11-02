/** Structured screenplay writing, independent of the application's toolbar. */
import { bindEditorToolbar, type EditorToolbar } from "../editor-common/toolbar";
import { Component, type InitElements, type MElement } from "../../src/component";
import { editorElement, editorId } from "../editor-common/dom";
import { EditorHistory } from "../editor-common/history";

export type ScreenplayZoom = "fit-parent"|number;
export type ScreenplayBlockType = "scene"|"action"|"character"|"dialogue"|"parenthetical"|"transition";
export interface ScreenplayBlock { id:string; type:ScreenplayBlockType; text:string; }
export interface ScreenplayDocument { title:string; blocks:ScreenplayBlock[]; }
export interface ScreenplayEditorOptions {
    document:ScreenplayDocument;
    readOnly:boolean;
    zoom:ScreenplayZoom;
    label:string;
    onChange:((document:ScreenplayDocument) => void)|null;
}

/** Supported block types, in keyboard cycling order. */
const TYPES:ScreenplayBlockType[] = ["scene", "action", "character", "dialogue", "parenthetical", "transition"];

export class ScreenplayEditor extends Component<ScreenplayEditorOptions> {
    private _document:ScreenplayDocument;
    private _history:EditorHistory<ScreenplayDocument>;
    private _activeId:string;
    private _originalNodes:Node[];
    private _addedClass:boolean;
    private _controller = new AbortController();
    private _resize:ResizeObserver;
    private _resizeFrame:number = 0;
    private _width:number = 0;
    private _disconnect:(() => void)|null = null;
    private _destroyed:boolean = false;
    private _composing:boolean = false;
    private _focusedTitle:boolean = false;
    private _paper:HTMLElement;
    private _pages:HTMLElement;
    private _draggedBlock:string = "";
    private _dropIndex:number = -1;
    private _title:HTMLInputElement;
    private _cursor:{id:string; start:number; end:number}|null = null;


    public constructor(el:HTMLElement, options:Partial<ScreenplayEditorOptions> = {}){
        // Initialize component ownership.
        super(el, options, ScreenplayEditor);
        // Resolve component options.
        this.options = {...ScreenplayEditor.defaults, ...options};
        // Validate preview sizing before modifying the host.
        this._validateZoom(this.options.zoom);

        // Validate and detach the initial document.
        this._document = this._normalize(this.options.document);
        // Initialize bounded history.
        this._history = new EditorHistory(this._document);
        // Select the first block.
        this._activeId = this._document.blocks[0].id;
        // Preserve authored content.
        this._originalNodes = Array.from(el.childNodes);
        // Track class ownership.
        this._addedClass = !el.classList.contains("screenplay-editor");
        // Apply the component root.
        el.classList.add("screenplay-editor");
        // Register the instance.
        el["M_ScreenplayEditor"] = this;
        // Create the title control.
        this._title = editorElement("input", "screenplay-title");
        // Name the title control accessibly.
        this._title.setAttribute("aria-label", "Screenplay title");
        // Set an empty-title hint.
        this._title.placeholder = "Untitled screenplay";
        // Create the screenplay page.
        this._paper = editorElement("div", "screenplay-paper");
        // Name the document region.
        this._paper.setAttribute("aria-label", this.options.label);
        // Identify the document region.
        this._paper.setAttribute("role", "group");
        // Create the page stack inside the fixed scrollable canvas.
        this._pages = editorElement("div", "screenplay-pages");

        // Keep page content independent of the viewport's dimensions.
        this._paper.append(this._pages);

        // Allow keyboard users to scroll the canvas directly.
        this._paper.tabIndex = 0;

        // Install the component UI.
        el.replaceChildren(this._title, this._paper);
        // Start block sorting from dedicated grips only.
        el.addEventListener("dragstart", this._onDragStart, {signal:this._controller.signal});

        // Preview semantic insertion positions.
        el.addEventListener("dragover", this._onDragOver, {signal:this._controller.signal});

        // Commit a completed block reorder.
        el.addEventListener("drop", this._onDrop, {signal:this._controller.signal});

        // Clear feedback after native cancellation or an external drop.
        el.addEventListener("dragend", this._clearDrag, {signal:this._controller.signal});

        // Clear stale insertion feedback when leaving the canvas.
        el.addEventListener("dragleave", this._onDragLeave, {signal:this._controller.signal});

        // Route text changes.
        el.addEventListener("input", this._onInput, {signal:this._controller.signal});
        // Route native undo gestures through document history.
        el.addEventListener("beforeinput", this._onBeforeInput, {signal:this._controller.signal});
        // Track the active block.
        el.addEventListener("focusin", this._onFocus, {signal:this._controller.signal});
        // Preserve full-block selection when focus moves to an external toolbar.
        el.addEventListener("focusout", this._rememberSelection, {signal:this._controller.signal});

        // Handle screenplay-specific keyboard commands.
        el.addEventListener("keydown", this._onKeydown, {signal:this._controller.signal});
        // Preserve IME entry without rebuilding the active control.
        el.addEventListener("compositionstart", this._onCompositionStart, {signal:this._controller.signal});
        // Commit a completed composition.
        el.addEventListener("compositionend", this._onCompositionEnd, {signal:this._controller.signal});
        // Reflow text when the paper width changes.
        this._resize = new ResizeObserver(this._onResize);
        // Observe the root width.
        this._resize.observe(el);
        // Render the initial document.
        this._render();

        // Track width independently of the page stack's changing height.
        this._width = el.clientWidth;
    }

    public static get defaults():ScreenplayEditorOptions {
        // Prepare result.
        const result:ScreenplayEditorOptions = {document:{title:"", blocks:[]}, readOnly:false, zoom:"fit-parent", label:"Screenplay", onChange:null};
        // Return result.
        return result;
    }

    public static init(el:HTMLElement, options?:Partial<ScreenplayEditorOptions>):ScreenplayEditor;
    public static init(els:InitElements<MElement>, options?:Partial<ScreenplayEditorOptions>):ScreenplayEditor[];
    public static init(els:HTMLElement|InitElements<MElement>, options:Partial<ScreenplayEditorOptions> = {}):ScreenplayEditor|ScreenplayEditor[] {
        // Prepare result.
        const result = super.init(els, options, ScreenplayEditor);
        // Return result.
        return result;
    }

    public static getInstance(el:HTMLElement):ScreenplayEditor {
        // Prepare result.
        const result = el["M_ScreenplayEditor"];
        // Return result.
        return result;
    }

    public getDocument():ScreenplayDocument {
        // Prepare result.
        const result = structuredClone(this._document);
        // Return result.
        return result;
    }

    /** Validate before replacing; programmatic loads are allowed in read-only mode. */
    public setDocument(document:ScreenplayDocument):void {
        // Load into a live component only.
        if(!this._destroyed){
            // Validate the entire replacement before mutation.
            const normalized = this._normalize(document);
            // Replace the document.
            this._document = normalized;
            // Select its first block.
            this._activeId = normalized.blocks[0].id;
            // Record the replacement without stealing focus.
            this._commit(true);
        }
    }

    public getActiveBlock():ScreenplayBlock {
        // Prepare result.
        const result = structuredClone(this._document.blocks.find(block => block.id === this._activeId) || this._document.blocks[0]);
        // Return result.
        return result;
    }

    public insertBlock(type:ScreenplayBlockType = "action", text:string = "", afterId:string = this._activeId):string {
        // Prepare result.
        let result = "";
        // Respect read-only mode and validate the requested type.
        if(this._editable() && TYPES.includes(type)){
            // Resolve the insertion location.
            const index = this._document.blocks.findIndex(block => block.id === afterId);
            // Create a stable block identifier.
            result = editorId("block");
            // Insert the new block after the selected one.
            this._document.blocks.splice(index < 0 ? this._document.blocks.length : index + 1, 0, {id:result, type, text:String(text)});
            // Select the new block.
            this._activeId = result;
            // Record and render the edit.
            this._commit(true);
            // Focus the new block.
            this.focus(result);
        }
        // Return result.
        return result;
    }

    public updateBlock(id:string, patch:Partial<Pick<ScreenplayBlock, "type"|"text">>):void {
        // Locate the requested block.
        const block = this._document.blocks.find(item => item.id === id);
        // Apply valid editable updates only.
        if(this._editable() && block && (!patch.type || TYPES.includes(patch.type))){
            // Apply the block type when supplied.
            if(patch.type)
                // Store the new screenplay role.
                block.type = patch.type;
            // Apply text when supplied.
            if(typeof patch.text === "string")
                // Store literal text without HTML interpretation.
                block.text = patch.text;
            // Select the updated block.
            this._activeId = id;
            // Record and rerender the document.
            this._commit(true);
        }
    }

    public setBlockType(type:ScreenplayBlockType):void {
        // Preserve the active textarea selection across formatting changes.
        const input = document.activeElement instanceof HTMLTextAreaElement && this._paper.contains(document.activeElement) ? document.activeElement : this._input(this._activeId);
        // Capture its selection.
        const selection = document.activeElement === input || this._cursor?.id !== this._activeId ? [Number(input?.dataset.blockStart || 0) + (input?.selectionStart || 0), Number(input?.dataset.blockStart || 0) + (input?.selectionEnd || 0)] : [this._cursor.start, this._cursor.end];
        // Update through the public mutation method.
        this.updateBlock(this._activeId, {type});
        // Restore the editing selection.
        this.focus(this._activeId, selection[0], selection[1]);
    }

    public removeBlock(id:string = this._activeId):void {
        // Locate the selected block.
        const index = this._document.blocks.findIndex(block => block.id === id);
        // Remove an editable block only.
        if(this._editable() && index >= 0){
            // Remove the requested block.
            this._document.blocks.splice(index, 1);
            // Keep an empty document editable.
            if(!this._document.blocks.length)
                // Insert a blank action block.
                this._document.blocks.push({id:editorId("block"), type:"action", text:""});
            // Select the nearest surviving block.
            this._activeId = this._document.blocks[Math.max(0, index - 1)].id;
            // Record the deletion.
            this._commit(true);
            // Restore editing focus.
            this.focus();
        }
    }

    public moveBlock(id:string, index:number):void {
        // Find the original position.
        const from = this._document.blocks.findIndex(block => block.id === id);
        // Validate the destination.
        const to = Math.max(0, Math.min(this._document.blocks.length - 1, Math.trunc(index)));
        // Move valid editable blocks only.
        if(this._editable() && from >= 0 && Number.isFinite(to) && from !== to){
            // Remove the block from its old position.
            const [block] = this._document.blocks.splice(from, 1);
            // Insert at the final destination index.
            this._document.blocks.splice(to, 0, block);
            // Keep the moved block active.
            this._activeId = id;
            // Record the reorder.
            this._commit(true);
            // Focus the moved block.
            this.focus();
        }
    }

    public toJSON():string {
        // Prepare result.
        const result = JSON.stringify(this.getDocument(), null, 2);
        // Return result.
        return result;
    }

    public fromJSON(json:string):void {
        // Parse and validate through the document setter.
        this.setDocument(JSON.parse(json));
    }

    /** Export readable plain text; this is not a Fountain or PDF serializer. */
    public toText():string {
        // Prepare result.
        const result = [this._document.title, ...this._document.blocks.map(block => ["scene", "character", "transition"].includes(block.type) ? block.text.toUpperCase() : block.text)].join("\n\n");
        // Return result.
        return result;
    }

    public undo():void {
        // Respect read-only mode.
        if(this._editable())
            // Restore the preceding document.
            this._restore(this._history.undo());
    }

    public redo():void {
        // Respect read-only mode.
        if(this._editable())
            // Restore the following document.
            this._restore(this._history.redo());
    }

    public setReadOnly(value:boolean):void {
        // Update a live editor only.
        if(!this._destroyed){
            // Store interaction mode.
            this.options.readOnly = value;
            // Apply it to all native controls.
            this._render();
        }
    }

    public focus(id:string = this._activeId, start?:number, end:number = start):void {
        // Locate a live editing control.
        const input = !this._destroyed && this._input(id, start || 0);
        // Focus an existing block.
        if(input){
            // Select the requested block.
            this._activeId = id;
            // Restore focus without jumping the page.
            input.focus({preventScroll:true});
            // Restore an explicitly supplied range.
            if(start !== undefined)
                // Apply the native selection.
                input.setSelectionRange(start - Number(input.dataset.blockStart), end - Number(input.dataset.blockStart));
            // Reveal a block that has flowed onto another page.
            input.scrollIntoView({block:"nearest", inline:"nearest"});

            // Refresh toolbar state.
            this._state();
        }
    }

    public canExecute(command:string):boolean {
        // Find the active position.
        const index = this._document.blocks.findIndex(block => block.id === this._activeId);
        // Prepare result.
        const result = this._editable() && ({undo:this._history.canUndo, redo:this._history.canRedo, type:true, insert:true, remove:true, up:index > 0, down:index < this._document.blocks.length - 1}[command] ?? false);
        // Return result.
        return result;
    }

    public execute(command:string, value:string = "action"):void {
        // Find the active position.
        const index = this._document.blocks.findIndex(block => block.id === this._activeId);
        // Map toolbar commands to public methods.
        const commands = {undo:() => this.undo(), redo:() => this.redo(), type:() => this.setBlockType(value as ScreenplayBlockType), insert:() => this.insertBlock(value as ScreenplayBlockType), remove:() => this.removeBlock(), up:() => this.moveBlock(this._activeId, index - 1), down:() => this.moveBlock(this._activeId, index + 1)};
        // Run available commands only.
        if(this.canExecute(command))
            // Invoke the requested method.
            commands[command]();
    }

    public connectToolbar(toolbar:EditorToolbar):() => void {
        // Prepare result.
        let result = ():void => {};
        // Bind a live editor only.
        if(!this._destroyed){
            // Release any prior binding.
            this._disconnect?.();
            // Connect the public command API.
            result = bindEditorToolbar(this.el, toolbar, (command, value) => this.execute(command, value), command => this.canExecute(command));
            // Retain the disconnect operation.
            this._disconnect = result;
        }
        // Return result.
        return result;
    }

    public destroy():void {
        // Restore the host exactly once.
        if(!this._destroyed){
            // Release any unfinished block drag.
            this._clearDrag();

            // Mark the editor inactive.
            this._destroyed = true;
            // Release delegated listeners.
            this._controller.abort();
            // Stop layout observation.
            this._resize.disconnect();

            // Cancel any deferred responsive preview update.
            cancelAnimationFrame(this._resizeFrame);
            // Release external toolbar listeners.
            this._disconnect?.();
            // Restore authored nodes.
            this.el.replaceChildren(...this._originalNodes);
            // Remove the component-owned class.
            if(this._addedClass)
                // Preserve application classes.
                this.el.classList.remove("screenplay-editor");
            // Remove the instance reference.
            delete this.el["M_ScreenplayEditor"];
        }
    }

    private _normalize(value:ScreenplayDocument):ScreenplayDocument {
        // Prepare result.
        const result:ScreenplayDocument = {title:"", blocks:[]};
        // Reject malformed documents before changing state.
        if(!value || typeof value.title !== "string" || !Array.isArray(value.blocks) || value.blocks.some(block => !block || !TYPES.includes(block.type) || typeof block.text !== "string"))
            // Explain the required document shape.
            throw new TypeError("Screenplay documents require a title and blocks with a valid type and text.");
        // Track identifiers already used in this document.
        const ids = new Set<string>();
        // Copy and normalize each block.
        const blocks = value.blocks.map(block => {
            // Prepare result.
            const result = {id:typeof block.id === "string" && block.id && !ids.has(block.id) ? block.id : editorId("block"), type:block.type, text:block.text.replace(/\r\n?/g, "\n")};
            // Reserve the identifier.
            ids.add(result.id);
            // Return result.
            return result;
        });
        // Keep empty documents writable.
        if(!blocks.length)
            // Add the first action block.
            blocks.push({id:editorId("block"), type:"action", text:""});
        // Create the detached result.
        Object.assign(result, {title:value.title, blocks});
        // Return result.
        return result;
    }

    private _editable():boolean {
        // Prepare result.
        const result = !this._destroyed && !this.options.readOnly;
        // Return result.
        return result;
    }

    /** Change preview size without changing physical screenplay formatting. */
    public setZoom(zoom:ScreenplayZoom):void {
        // Validate before changing the current preview.
        this._validateZoom(zoom);

        // Apply preview changes to live editors only.
        if(!this._destroyed && this.options.zoom !== zoom){
            // Capture the old preview scale and reading position.
            const previous = Number(this._paper.style.getPropertyValue("--screenplay-page-scale")) || 1;

            // Preserve the approximate position within the writing pages.
            const scroll = {top:this._paper.scrollTop, left:this._paper.scrollLeft};

            // Store the requested fixed zoom or responsive mode.
            this.options.zoom = zoom;

            // Resize previews without rebuilding native text controls.
            this._scalePages();

            // Resolve the relative change in display size.
            const ratio = Number(this._paper.style.getPropertyValue("--screenplay-page-scale")) / previous;

            // Preserve the vertical reading position at the new scale.
            this._paper.scrollTop = scroll.top * ratio;

            // Return to the left edge when fitting the parent width.
            this._paper.scrollLeft = zoom === "fit-parent" ? 0 : scroll.left * ratio;

            // Notify external zoom controls without creating a document edit.
            this.el.dispatchEvent(new CustomEvent("screenplayzoomchange", {bubbles:true, detail:{zoom:this.getZoom()}}));
        }
    }

    public getZoom():ScreenplayZoom {
        // Prepare result.
        const result = this.options.zoom;

        // Return result.
        return result;
    }

    private _validateZoom(zoom:ScreenplayZoom):void {
        // Accept responsive sizing or a finite scale from 25% to 200%.
        if(zoom !== "fit-parent" && (typeof zoom !== "number" || !Number.isFinite(zoom) || zoom < 0.25 || zoom > 2))
            // Reject invalid sizes before altering the layout.
            throw new RangeError("Screenplay zoom must be fit-parent or a number from 0.25 to 2.");
    }

    /** Read the number of complete A4 sheets in the writing layout. */
    public getPageCount():number {
        // Prepare result.
        const result = this._paper.querySelectorAll(".screenplay-page").length;

        // Return result.
        return result;
    }

    private _input(id:string, offset:number = 0):HTMLTextAreaElement|undefined {
        // Collect the visual continuations of the requested semantic block.
        const inputs = Array.from(this._paper.querySelectorAll<HTMLTextAreaElement>("textarea[data-block-id]")).filter(input => input.dataset.blockId === id);

        // Prefer the continuation containing the requested document offset.
        const result = inputs.find(input => Number(input.dataset.blockEnd) > offset) || inputs[inputs.length - 1];

        // Return result.
        return result;
    }

    private _render():void {
        // Synchronize the title outside the screenplay page count.
        this._title.value = this._document.title;

        // Apply read-only mode to the title.
        this._title.readOnly = this.options.readOnly;

        // Lay out the document on fixed-size writing sheets.
        this._fitText();

        // Synchronize selected block and toolbar availability.
        this._state();
    }

    /** Paginate at the same physical width at every screen size. */
    private _fitText():void {
        // Preserve the canvas position while rebuilding visual continuations.
        const scroll = {top:this._paper.scrollTop, left:this._paper.scrollLeft};

        // Preserve the current native text selection before replacing page fragments.
        const focused = document.activeElement as HTMLTextAreaElement;

        // Capture offsets in the complete semantic block, not its visual fragment.
        const selection = this._paper.contains(focused) && focused.matches("textarea[data-block-id]") && focused.dataset.blockId === this._activeId ? {
            id:focused.dataset.blockId || "",
            start:Number(focused.dataset.blockStart) + focused.selectionStart,
            end:Number(focused.dataset.blockStart) + focused.selectionEnd,
            direction:focused.selectionDirection,
            page:focused.closest(".screenplay-page")?.getAttribute("aria-label"),
        } : null;

        // Avoid replacing an active IME composition.
        if(!this._composing){
            // Cancel stale drag feedback before replacing block fragments.
            this._clearDrag();

            // Retain the previous page count for layout notifications.
            const previousCount = this.getPageCount();

            // Create the fixed-size first sheet used for layout measurements.
            const first = this._createPage(1);

            // Install the first writing page.
            this._pages.replaceChildren(first);

            // Track the current sheet's writing area.
            let body = first.querySelector<HTMLElement>(".screenplay-page-body");

            // Read the physical content height independently of preview scaling.
            const capacity = body.clientHeight || (297 - 50.8) * 96 / 25.4;

            // Measure using the same native wrapping as the visible text fields.
            const measure = editorElement("textarea", "screenplay-block-input screenplay-measure");

            // Hide the transient measurement control from keyboard and accessibility navigation.
            measure.tabIndex = -1;

            // Exclude the measurement field from screen readers.
            measure.setAttribute("aria-hidden", "true");

            // Attach the measurement field at the real page width.
            body.append(measure);

            // Read the fixed screenplay line height.
            const lineHeight = parseFloat(getComputedStyle(measure).lineHeight);

            // Reserve complete lines inside the physical writing area.
            const pageHeight = Math.floor(capacity / lineHeight) * lineHeight;

            // Track used vertical space on the current page.
            let used = 0;

            // Track the preceding role for dialogue spacing.
            let previousType:ScreenplayBlockType|null = null;

            // Render each semantic block without changing document data.
            for(const [index, block] of this._document.blocks.entries()){
                // Resolve standard screenplay indentation in physical inches.
                const indent = {scene:[0, 0], action:[0, 0], character:[2, 0], dialogue:[1, 1], parenthetical:[1.5, 1], transition:[0, 0]}[block.type];

                // Match the native measurement width to this role's writing area.
                measure.style.width = `calc(100% - ${indent[0] + indent[1]}in)`;

                // Track the source offset of each visual continuation.
                let start = 0;

                // Render one field even for an empty block.
                let pending = true;

                // Keep a speech group tight while separating other screenplay elements.
                let gap = used && !((block.type === "dialogue" || block.type === "parenthetical") && (previousType === "character" || previousType === "parenthetical")) ? lineHeight : 0;

                // Split unusually long blocks across sheets without inserting document blocks.
                while(pending){
                    // Avoid leaving headings or character cues alone at the foot of a page.
                    const reserve = ["scene", "character", "parenthetical"].includes(block.type) && index < this._document.blocks.length - 1 ? lineHeight * 3 : lineHeight;

                    // Start a new page when the next fragment cannot fit.
                    if(used && pageHeight - used - gap < reserve){
                        // Create the next numbered A4 sheet.
                        const page = this._createPage(this.getPageCount() + 1);

                        // Append it in reading order.
                        this._pages.append(page);

                        // Continue writing in the new page body.
                        body = page.querySelector<HTMLElement>(".screenplay-page-body");

                        // Reset the used height.
                        used = 0;

                        // Omit leading space on a fresh page.
                        gap = 0;
                    }

                    // Measure the remaining source text.
                    measure.value = block.text.slice(start);

                    // Release the previous measured height.
                    measure.style.height = "0px";

                    // Calculate the usable height for this fragment.
                    const available = pageHeight - used - gap;

                    // Assume the remaining text fits until measured otherwise.
                    let length = block.text.length - start;

                    // Find the largest source prefix that fits this sheet.
                    if(measure.scrollHeight > available){
                        // Begin the fitting range with a single character.
                        let low = 1;

                        // Bound the search by the remaining text length.
                        let high = length;

                        // Search monotonically by native wrapped height.
                        while(low < high){
                            // Test the upper midpoint.
                            const middle = Math.ceil((low + high) / 2);

                            // Measure the candidate prefix.
                            measure.value = block.text.slice(start, start + middle);

                            // Keep the prefix when it fits the remaining lines.
                            if(measure.scrollHeight <= available)
                                // Search the longer half.
                                low = middle;
                            else
                                // Search the shorter half.
                                high = middle - 1;
                        }

                        // Preserve the fitting prefix.
                        length = low;

                        // Prefer a word boundary when the split would cut a word.
                        if(/\S/.test(block.text[start + length - 1] || "") && /\S/.test(block.text[start + length] || "")){
                            // Find the most recent whitespace in the fitting prefix.
                            const boundary = block.text.slice(start, start + length).search(/\s\S*$/);

                            // Keep long unbroken words splittable when no boundary exists.
                            if(boundary >= 0)
                                // Include the separator in the previous fragment.
                                length = boundary + 1;
                        }
                    }

                    // Create the semantic fragment wrapper.
                    const wrapper = editorElement("div", `screenplay-block screenplay-${block.type}`);

                    // Preserve block identity across visual page breaks.
                    wrapper.dataset.blockId = block.id;

                    // Retain the active block's marker after reflow.
                    wrapper.classList.toggle("is-active", block.id === this._activeId);

                    // Set the inter-element spacing outside the text field.
                    wrapper.style.marginTop = `${gap}px`;

                    // Create the native writing control.
                    const input = editorElement("textarea", "screenplay-block-input");

                    // Store the source block identity.
                    input.dataset.blockId = block.id;

                    // Store this fragment's start offset.
                    input.dataset.blockStart = String(start);

                    // Store this fragment's exclusive end offset.
                    input.dataset.blockEnd = String(start + length);

                    // Name the role without consuming screenplay lines with visible labels.
                    input.setAttribute("aria-label", `${block.type === "scene" ? "Scene heading" : block.type} ${index + 1}${start ? " continued" : ""}`);

                    // Use a one-line minimum.
                    input.rows = 1;

                    // Preserve the exact source text in this continuation.
                    input.value = block.text.slice(start, start + length);

                    // Provide an empty-field hint.
                    input.placeholder = block.type === "scene" ? "INT. LOCATION — DAY" : `Write ${block.type}…`;

                    // Apply read-only mode to every continuation.
                    input.readOnly = this.options.readOnly;

                    // Measure the final fragment at its fixed writing width.
                    measure.value = input.value;

                    // Allocate whole lines without overflow into the page margin.
                    const height = Math.min(available, Math.max(lineHeight, measure.scrollHeight));

                    // Set the native field height.
                    input.style.height = `${height}px`;

                    // Create a grip outside the writing area.
                    const handle = editorElement("button", "screenplay-block-handle");

                    // Prevent surrounding form submission.
                    handle.type = "button";

                    // Associate the grip with its complete semantic block.
                    handle.dataset.blockId = block.id;

                    // Enable native dragging only in editable mode.
                    handle.draggable = !this.options.readOnly;

                    // Disable keyboard sorting in read-only mode.
                    handle.disabled = this.options.readOnly;

                    // Describe pointer and keyboard sorting accessibly.
                    handle.setAttribute("aria-label", `Move ${block.type} block ${index + 1}: drag or use arrow keys`);

                    // Add the familiar six-dot Material grip.
                    const icon = editorElement("i", "material-icons", "drag_indicator");

                    // Hide the decorative icon from screen readers.
                    icon.setAttribute("aria-hidden", "true");

                    // Compose the sorting grip.
                    handle.append(icon);

                    // Keep the grip outside the native textarea and its page measurements.
                    wrapper.append(handle, input);

                    // Add it to the current sheet.
                    body.append(wrapper);

                    // Advance the page's occupied height.
                    used += gap + height;

                    // Advance the source range.
                    start += length;

                    // Continue until every source character is displayed.
                    pending = start < block.text.length;

                    // Continuations do not introduce extra paragraph spacing.
                    gap = 0;
                }

                // Retain the preceding role for speech spacing.
                previousType = block.type;
            }

            // Remove the transient measurement control.
            measure.remove();

            // Fit the complete sheets to the available screen width.
            this._scalePages();

            // Keep ordinary typing on the same visible part of the page stack.
            this._paper.scrollTop = scroll.top;

            // Preserve horizontal scrolling at fixed zoom levels.
            this._paper.scrollLeft = scroll.left;

            // Restore the selected source position after pagination.
            if(selection){
                // Locate the fragment containing the caret.
                const input = this._input(selection.id, selection.start);

                // Restore native focus and selection without scrolling the document.
                if(input){
                    // Read the new fragment's source offset.
                    const offset = Number(input.dataset.blockStart);

                    // Focus the new native continuation.
                    input.focus({preventScroll:true});

                    // Restore the selection within this native field.
                    input.setSelectionRange(selection.start - offset, selection.end - offset, selection.direction);

                    // Keep the caret visible when typing crosses a physical page break.
                    if(input.closest(".screenplay-page")?.getAttribute("aria-label") !== selection.page)
                        // Scroll the outer document instead of clipping the writing sheet.
                        input.scrollIntoView({block:"nearest", inline:"nearest"});
                }
            }

            // Notify integrations only when the page count changes.
            if(previousCount !== this.getPageCount())
                // Expose physical page count independently of document edits.
                this.el.dispatchEvent(new CustomEvent("screenplaylayoutchange", {bubbles:true, detail:{pages:this.getPageCount()}}));
        }
    }

    private _createPage(number:number):HTMLElement {
        // Prepare the scaled preview frame.
        const result = editorElement("div", "screenplay-page-frame");

        // Create an actual A4 sheet inside the preview frame.
        const page = editorElement("section", "screenplay-page");

        // Name the page accessibly.
        page.setAttribute("aria-label", `Screenplay page ${number}`);

        // Create the fixed-margin writing area.
        const body = editorElement("div", "screenplay-page-body");

        // Create a page number outside the writing area.
        const label = editorElement("span", "screenplay-page-number", `${number}.`);

        // Hide the redundant visual page number from assistive technology.
        label.setAttribute("aria-hidden", "true");

        // Compose the physical sheet.
        page.append(label, body);

        // Wrap the sheet for proportional screen scaling.
        result.append(page);

        // Return result.
        return result;
    }

    private _onResize = ():void => {
        // Read only the width that controls proportional preview scaling.
        const width = this.el.clientWidth;

        // Ignore height notifications caused by the page stack itself.
        if(width !== this._width){
            // Detect initialization in a hidden container.
            const wasHidden = this._width === 0;

            // Remember the latest width.
            this._width = width;

            // Coalesce pending responsive updates.
            cancelAnimationFrame(this._resizeFrame);

            // Change layout outside the resize-observer delivery phase.
            this._resizeFrame = requestAnimationFrame(() => {
                // Ignore work queued before destruction.
                if(!this._destroyed){
                    // Measure text once a previously hidden editor becomes visible.
                    if(wasHidden && width > 0)
                        // Build real pages after physical dimensions become measurable.
                        this._fitText();
                    else
                        // Resize the preview without repaginating fixed-width text.
                        this._scalePages();
                }
            });
        }
    };

    private _scalePages():void {
        // Measure the fixed A4 width without its preview transform.
        const page = this._paper.querySelector<HTMLElement>(".screenplay-page");

        // Scale previews without changing text wrapping or pagination.
        if(page && page.offsetWidth > 0){
            // Read the available canvas width excluding its padding.
            const available = this._paper.clientWidth - 48;

            // Fit the parent width by default or use the selected fixed display size.
            const scale = this.options.zoom === "fit-parent" ? Math.max(0.1, available / page.offsetWidth) : this.options.zoom;

            // Share the scale between the sheet and its flow frame.
            this._paper.style.setProperty("--screenplay-page-scale", String(scale));
        }
    }

    private _state():void {
        // Mark the active block visually.
        for(const block of this._paper.querySelectorAll<HTMLElement>(".screenplay-block"))
            // Keep selection state scoped to this editor.
            block.classList.toggle("is-active", (block as HTMLElement).dataset.blockId === this._activeId);
        // Notify integrations of the selected block.
        this.el.dispatchEvent(new CustomEvent("screenplayselectionchange", {bubbles:true, detail:{block:this.getActiveBlock()}}));
        // Update connected toolbar state.
        this.el.dispatchEvent(new CustomEvent("editorstatechange"));
    }

    private _commit(render:boolean):void {
        // Record the changed document.
        this._history.commit(this._document);
        // Rebuild semantic structure only when necessary.
        if(render)
            // Preserve native caret state during ordinary typing.
            this._render();
        else
            // Refresh command availability without replacing text controls.
            this._state();
        // Notify consumers with a detached document.
        this._emitChange();
    }

    private _emitChange():void {
        // Synchronize options for programmatic inspection.
        this.options.document = this.getDocument();
        // Dispatch the public change event.
        this.el.dispatchEvent(new CustomEvent("screenplaychange", {bubbles:true, detail:{document:this.getDocument()}}));
        // Notify the optional callback.
        this.options.onChange?.(this.getDocument());
    }

    private _restore(value:ScreenplayDocument|undefined):void {
        // Restore available history only.
        if(value){
            // Preserve the active visual continuation when possible.
            const active = document.activeElement;

            // Locate the last native writing control.
            const input = this._focusedTitle ? this._title : active instanceof HTMLTextAreaElement && this._paper.contains(active) ? active : this._input(this._activeId);

            // Read its offset within the complete block.
            const offset = Number(input?.dataset.blockStart || 0);

            // Capture selection in document coordinates.
            const selection = {start:offset + (input?.selectionStart || 0), end:offset + (input?.selectionEnd || 0), length:this._focusedTitle ? this._document.title.length : this.getActiveBlock().text.length};

            // Restore the last source selection when undo was invoked from the toolbar.
            if(!this._focusedTitle && active !== input && this._cursor?.id === this._activeId)
                // Reuse full-block offsets captured on blur.
                Object.assign(selection, {start:this._cursor.start, end:this._cursor.end});

            // Restore the detached history snapshot.
            this._document = value;

            // Keep the active block valid after structural changes.
            if(!value.blocks.some(block => block.id === this._activeId))
                // Select the first restored block.
                this._activeId = value.blocks[0].id;

            // Rebuild the physical pages.
            this._render();

            // Notify consumers without creating a history entry.
            this._emitChange();

            // Adjust the caret for the restored text length.
            const delta = (this._focusedTitle ? value.title.length : this.getActiveBlock().text.length) - selection.length;

            // Restore title focus independently of screenplay pagination.
            if(this._focusedTitle){
                // Focus the document title.
                this._title.focus({preventScroll:true});

                // Restore the title's native selection.
                this._title.setSelectionRange(Math.max(0, selection.start + delta), Math.max(0, selection.end + delta));
            }else
                // Focus the correct continuation using full-block offsets.
                this.focus(this._activeId, Math.max(0, selection.start + delta), Math.max(0, selection.end + delta));
        }
    }

    private _onDragStart = (event:DragEvent):void => {
        // Resolve a dedicated screenplay grip.
        const handle = (event.target as Element).closest<HTMLButtonElement>(".screenplay-block-handle");

        // Resolve its complete semantic block.
        const block = handle?.closest<HTMLElement>(".screenplay-block");

        // Sort only editable blocks through their handles.
        if(this._editable() && block && this._paper.contains(block) && event.dataTransfer){
            // Retain local drag ownership without trusting external payloads.
            this._draggedBlock = block.dataset.blockId || "";

            // Select the dragged semantic block.
            this._activeId = this._draggedBlock;

            // Reflect selection in the writing toolbar.
            this._state();

            // Advertise native move behavior.
            event.dataTransfer.effectAllowed = "move";

            // Supply drag data required by native browsers.
            event.dataTransfer.setData("text/plain", this._draggedBlock);

            // Preview the writing block rather than only its small grip.
            event.dataTransfer.setDragImage(block, 0, 0);

            // Dim every visual continuation of the dragged block.
            for(const item of this._paper.querySelectorAll<HTMLElement>(".screenplay-block"))
                // Keep drag feedback attached to the semantic block.
                item.classList.toggle("is-dragging", item.dataset.blockId === this._draggedBlock);
        }else
            // Keep selected text from initiating a block reorder.
            event.preventDefault();
    };

    private _onDragOver = (event:DragEvent):void => {
        // Resolve the sheet under the pointer, including its blank margins.
        const page = (event.target as Element).closest<HTMLElement>(".screenplay-page");

        // Remove the previous full-width insertion marker.
        this._clearDrop();

        // Accept only a local drag inside this editor's physical pages.
        if(this._editable() && this._draggedBlock && page && this._paper.contains(page)){
            // Locate potential semantic destinations on the current sheet.
            const blocks = Array.from(page.querySelectorAll<HTMLElement>(".screenplay-block")).filter(block => block.dataset.blockId !== this._draggedBlock);

            // Pick the next block by vertical position without requiring a hit on its text.
            const following = blocks.find(block => {
                // Measure the visible vertical center of this fragment.
                const bounds = block.getBoundingClientRect();

                // Prepare result.
                const result = event.clientY <= bounds.top + bounds.height / 2;

                // Return result.
                return result;
            });

            // Fall back to insertion after the final block on the sheet.
            const target = following || blocks[blocks.length - 1];

            // Preview only destinations with a valid semantic neighbor.
            if(target){
                // Allow drops across the complete row, including blank page space.
                event.preventDefault();

                // Show native move feedback.
                if(event.dataTransfer)
                    // Advertise the local move operation.
                    event.dataTransfer.dropEffect = "move";

                // Distinguish insertion before the next block from after the last one.
                const after = !following;

                // Resolve the source's semantic index.
                const from = this._document.blocks.findIndex(block => block.id === this._draggedBlock);

                // Resolve the chosen semantic insertion boundary.
                const insertion = this._document.blocks.findIndex(block => block.id === target.dataset.blockId) + (after ? 1 : 0);

                // Convert the boundary to a final index after removing the source.
                this._dropIndex = insertion - (from < insertion ? 1 : 0);

                // Track the selected insertion side for integrations and cleanup.
                target.classList.add(after ? "is-drop-after" : "is-drop-before");

                // Create feedback independent of the target block's indentation.
                const marker = editorElement("div", "screenplay-drop-indicator");

                // Exclude transient visual feedback from accessibility navigation.
                marker.setAttribute("aria-hidden", "true");

                // Position the marker at the selected block boundary in physical page units.
                marker.style.top = `${target.offsetTop + (after ? target.offsetHeight : 0)}px`;

                // Span the complete writing area rather than the short text field.
                target.parentElement.append(marker);
            }
        }
    };

    private _onDrop = (event:DragEvent):void => {
        // Commit only a valid local drag destination.
        if(this._editable() && this._draggedBlock && this._dropIndex >= 0){
            // Prevent native textarea text insertion.
            event.preventDefault();

            // Capture the source before clearing transient state.
            const id = this._draggedBlock;

            // Capture the final position.
            const index = this._dropIndex;

            // Clear feedback before rendering the new document order.
            this._clearDrag();

            // Record one undoable semantic block move.
            this.moveBlock(id, index);
        }
    };

    private _onDragLeave = (event:DragEvent):void => {
        // Clear stale destinations when leaving the writing canvas.
        if(!(event.relatedTarget instanceof Node) || !this._paper.contains(event.relatedTarget))
            // Keep the local drag active without retaining an old target.
            this._clearDrop();
    };

    private _clearDrop():void {
        // Remove insertion feedback from all visual fragments.
        for(const block of this._paper.querySelectorAll(".is-drop-before, .is-drop-after"))
            // Restore the ordinary writing appearance.
            block.classList.remove("is-drop-before", "is-drop-after");

        // Remove full-width insertion feedback from the page bodies.
        for(const marker of this._paper.querySelectorAll(".screenplay-drop-indicator"))
            // Release transient drag overlays.
            marker.remove();

        // Invalidate the old insertion position.
        this._dropIndex = -1;
    }

    private _clearDrag = ():void => {
        // Remove insertion feedback.
        this._clearDrop();

        // Restore dragged fragment opacity.
        for(const block of this._paper.querySelectorAll(".is-dragging"))
            // Clear transient drag styling.
            block.classList.remove("is-dragging");

        // Release local drag ownership.
        this._draggedBlock = "";
    };

    private _rememberSelection = (event:FocusEvent):void => {
        // Capture only semantic screenplay text controls.
        const input = event.target;

        // Preserve source offsets before an external control takes focus.
        if(input instanceof HTMLTextAreaElement && input.dataset.blockId)
            // Retain the selection independently of visual page fragments.
            this._cursor = {id:input.dataset.blockId, start:Number(input.dataset.blockStart) + input.selectionStart, end:Number(input.dataset.blockStart) + input.selectionEnd};
    };

    private _onFocus = (event:FocusEvent):void => {
        // Resolve the focused block control.
        const input = event.target as HTMLTextAreaElement;
        // Remember whether history should return to the title field.
        this._focusedTitle = event.target === this._title;
        // Track semantic block selection only.
        if(input.dataset.blockId){
            // Select the focused block.
            this._activeId = input.dataset.blockId;
            // Refresh toolbar state.
            this._state();
        }
    };

    private _onInput = (event:Event):void => {
        // Read the edited native control.
        const input = event.target as HTMLInputElement|HTMLTextAreaElement;
        // Ignore synthetic edits in read-only mode.
        if(this._editable()){
            // Update the title independently of semantic blocks.
            if(input === this._title)
                // Store the new title.
                this._document.title = input.value;
            else {
                // Find the edited block.
                const block = this._document.blocks.find(item => item.id === input.dataset.blockId);
                // Apply text to a known block.
                if(block){
                    // Read this visual continuation's original source range.
                    const start = Number(input.dataset.blockStart);

                    // Replace only the edited continuation in the semantic block.
                    block.text = block.text.slice(0, start) + input.value + block.text.slice(Number(input.dataset.blockEnd));

                    // Keep the range current during a multi-event IME composition.
                    input.dataset.blockEnd = String(start + input.value.length);
                }
            }
            // Resize without rebuilding the focused control.
            this._fitText();
            // Defer a composed edit until it completes.
            if(!this._composing)
                // Record the edit.
                this._commit(false);
        }
    };

    private _onBeforeInput = (event:InputEvent):void => {
        // Keep context-menu and mobile undo consistent with keyboard commands.
        if(event.inputType === "historyUndo" || event.inputType === "historyRedo"){
            // Prevent independent native control history.
            event.preventDefault();
            // Restore the requested document snapshot.
            this.execute(event.inputType === "historyUndo" ? "undo" : "redo");
        }
    };

    private _onCompositionStart = ():void => {
        // Defer history and keyboard formatting during IME composition.
        this._composing = true;
    };

    private _onCompositionEnd = ():void => {
        // Resume history recording.
        this._composing = false;
        // Record the completed composition.
        if(this._editable()){
            // Reflow the completed composition into A4 continuations.
            this._fitText();

            // Commit the completed input as one document edit.
            this._commit(false);
        }
    };

    private _onKeydown = (event:KeyboardEvent):void => {
        // Resolve keyboard sorting from a dedicated grip.
        const handle = (event.target as Element).closest<HTMLButtonElement>(".screenplay-block-handle");

        // Provide keyboard reordering equivalent to dragging.
        if(this._editable() && handle && ["ArrowUp", "ArrowDown"].includes(event.key)){
            // Prevent canvas scrolling while sorting a block.
            event.preventDefault();

            // Capture the semantic source identity.
            const id = handle.dataset.blockId || "";

            // Resolve its current document position.
            const index = this._document.blocks.findIndex(block => block.id === id);

            // Reorder through the public history method.
            this.moveBlock(id, index + (event.key === "ArrowUp" ? -1 : 1));

            // Locate the moved block's new grip.
            const moved = Array.from(this._paper.querySelectorAll<HTMLButtonElement>(".screenplay-block-handle")).find(button => button.dataset.blockId === id);

            // Keep repeated arrow-key moves on the same block.
            moved?.focus({preventScroll:true});
        }

        // Preserve IME candidate navigation and read-only controls.
        if(this._editable() && !event.isComposing && !this._composing){
            // Route undo and redo through document history.
            if((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())){
                // Prevent independent native textarea history.
                event.preventDefault();
                // Restore the requested document state.
                this.execute(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
            }else if(event.target instanceof HTMLTextAreaElement){
                // Resolve the active semantic block.
                const block = this._document.blocks.find(item => item.id === event.target["dataset"].blockId);
                // Handle semantic editing only for known blocks.
                if(block){
                    // Read the native textarea.
                    const input = event.target;
                    // Read the caret in complete-block coordinates.
                    const offset = Number(input.dataset.blockStart) + input.selectionStart;

                    // Detect a collapsed caret at a visual page boundary.
                    const collapsed = input.selectionStart === input.selectionEnd;

                    // Delete seamlessly across visual continuations.
                    if(collapsed && ((event.key === "Backspace" && input.selectionStart === 0 && offset > 0) || (event.key === "Delete" && input.selectionEnd === input.value.length && offset < block.text.length))){
                        // Prevent the native field from stopping at its fragment edge.
                        event.preventDefault();

                        // Select the adjacent source character to remove.
                        const position = event.key === "Backspace" ? offset - 1 : offset;

                        // Remove the character without altering semantic block structure.
                        block.text = block.text.slice(0, position) + block.text.slice(position + 1);

                        // Record and reflow the edit.
                        this._commit(true);

                        // Restore the source caret after deletion.
                        this.focus(block.id, position);
                    }else if(collapsed && !event.shiftKey && ((event.key === "ArrowLeft" && input.selectionStart === 0 && offset > 0) || (event.key === "ArrowRight" && input.selectionEnd === input.value.length && offset < block.text.length))){
                        // Move across a physical page boundary within the same block.
                        event.preventDefault();

                        // Focus the adjacent source position.
                        this.focus(block.id, offset + (event.key === "ArrowLeft" ? -1 : 1));
                    }else if(event.key === "Enter" && !event.shiftKey){
                        // Replace the native newline with a semantic split.
                        event.preventDefault();
                        // Preserve text after the selected range.
                        const tail = block.text.slice(Number(input.dataset.blockStart) + input.selectionEnd);
                        // Keep text before the selected range.
                        block.text = block.text.slice(0, Number(input.dataset.blockStart) + input.selectionStart);
                        // Choose the natural next screenplay role.
                        const next:ScreenplayBlockType = block.type === "character" || block.type === "parenthetical" ? "dialogue" : "action";
                        // Insert and focus the following block in one history step.
                        this.insertBlock(next, tail, block.id);
                    }else if(event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)){
                        // Keep ordinary Tab available for accessible navigation.
                        event.preventDefault();
                        // Cycle block roles with Alt+ArrowUp or Alt+ArrowDown.
                        this.setBlockType(TYPES[(TYPES.indexOf(block.type) + (event.key === "ArrowUp" ? TYPES.length - 1 : 1)) % TYPES.length]);
                    }else if(event.key === "Backspace" && !block.text && this._document.blocks.length > 1){
                        // Remove empty blocks without affecting text in neighboring blocks.
                        event.preventDefault();
                        // Delete the active empty block.
                        this.removeBlock(block.id);
                    }
                }
            }
        }
    };
}
