/** Visual shot planning with editable cards and serializable document data. */
import { bindEditorToolbar, type EditorToolbar } from "../editor-common/toolbar";
import { Component, type InitElements, type MElement } from "../../src/component";
import { editorElement, editorId } from "../editor-common/dom";
import CrazyButton from "../extensions/web/crazy-button";
import { EditorHistory } from "../editor-common/history";

export interface StoryboardShot {
    id:string;
    title:string;
    image:string;
    description:string;
    camera:string;
    duration:number;
}

export interface StoryboardOptions {
    shots:StoryboardShot[];
    readOnly:boolean;
    label:string;
    onChange:((shots:StoryboardShot[]) => void)|null;
}

/** A storyboard owns data and editing; image storage remains application-owned. */
export class Storyboard extends Component<StoryboardOptions> {
    private _shots:StoryboardShot[];
    private _selectedId:string = "";
    private _history:EditorHistory<StoryboardShot[]>;
    private _originalNodes:Node[];
    private _addedClass:boolean;
    private _controller = new AbortController();
    private _disconnect:(() => void)|null = null;
    private _destroyed:boolean = false;
    private _grid:HTMLElement;
    private _status:HTMLElement;
    private _draggedId:string = "";
    private _dropIndex:number = -1;

    public constructor(el:HTMLElement, options:Partial<StoryboardOptions> = {}){
        // Initialize component ownership.
        super(el, options, Storyboard);
        // Resolve options.
        this.options = {...Storyboard.defaults, ...options};
        // Validate initial data.
        this._shots = this._normalize(this.options.shots);
        // Select the first available shot.
        this._selectedId = this._shots[0]?.id || "";
        // Initialize history.
        this._history = new EditorHistory(this._shots);
        // Preserve authored content.
        this._originalNodes = Array.from(el.childNodes);
        // Track class ownership.
        this._addedClass = !el.classList.contains("storyboard");
        // Apply component styling.
        el.classList.add("storyboard");
        // Register the instance.
        el["M_Storyboard"] = this;
        // Create the responsive shot grid.
        this._grid = editorElement("div", "storyboard-grid");
        // Identify the collection accessibly.
        this._grid.setAttribute("role", "group");
        // Name the collection.
        this._grid.setAttribute("aria-label", this.options.label);
        // Create the shot-count and duration readout.
        this._status = editorElement("p", "storyboard-status");
        // Announce completed shot reorders without interrupting editing.
        this._status.setAttribute("aria-live", "polite");

        // Install the component UI.
        el.replaceChildren(this._grid, this._status);
        // Route native undo requests through board history.
        el.addEventListener("beforeinput", this._onBeforeInput, {signal:this._controller.signal});
        // Track card selection.
        el.addEventListener("focusin", this._onFocus, {signal:this._controller.signal});
        // Handle card commands.
        el.addEventListener("click", this._onClick, {signal:this._controller.signal});
        // Route rounded card actions without executing their native click twice.
        el.addEventListener("buttonaction", this._onClick, {signal:this._controller.signal});

        // Begin sorting only from the six-dot handle.
        el.addEventListener("dragstart", this._onDragStart, {signal:this._controller.signal});

        // Preview the destination between cards.
        el.addEventListener("dragover", this._onDragOver, {signal:this._controller.signal});

        // Commit a completed reorder through the public history API.
        el.addEventListener("drop", this._onDrop, {signal:this._controller.signal});

        // Remove drag feedback after cancellation or an external drop.
        el.addEventListener("dragend", this._clearDrag, {signal:this._controller.signal});

        // Clear insertion feedback when leaving the board.
        el.addEventListener("dragleave", this._onDragLeave, {signal:this._controller.signal});

        // Record editable shot metadata.
        el.addEventListener("input", this._onInput, {signal:this._controller.signal});
        // Apply frame URLs after editing completes.
        el.addEventListener("change", this._onChange, {signal:this._controller.signal});
        // Support document history shortcuts.
        el.addEventListener("keydown", this._onKeydown, {signal:this._controller.signal});
        // Render the initial cards.
        this._render();
    }

    public static get defaults():StoryboardOptions {
        // Prepare result.
        const result:StoryboardOptions = {shots:[], readOnly:false, label:"Storyboard", onChange:null};
        // Return result.
        return result;
    }

    public static init(el:HTMLElement, options?:Partial<StoryboardOptions>):Storyboard;
    public static init(els:InitElements<MElement>, options?:Partial<StoryboardOptions>):Storyboard[];
    public static init(els:HTMLElement|InitElements<MElement>, options:Partial<StoryboardOptions> = {}):Storyboard|Storyboard[] {
        // Prepare result.
        const result = super.init(els, options, Storyboard);
        // Return result.
        return result;
    }

    public static getInstance(el:HTMLElement):Storyboard {
        // Prepare result.
        const result = el["M_Storyboard"];
        // Return result.
        return result;
    }

    public getShots():StoryboardShot[] {
        // Prepare result.
        const result = structuredClone(this._shots);
        // Return result.
        return result;
    }

    public setShots(shots:StoryboardShot[]):void {
        // Update live components only.
        if(!this._destroyed){
            // Validate the complete replacement before mutation.
            const normalized = this._normalize(shots);
            // Replace shot data.
            this._shots = normalized;
            // Select the first available shot.
            this._selectedId = normalized[0]?.id || "";
            // Record and render the replacement.
            this._commit(true);
        }
    }

    public getSelectedShot():StoryboardShot|null {
        // Prepare result.
        const result = structuredClone(this._shots.find(shot => shot.id === this._selectedId) || null);
        // Return result.
        return result;
    }

    public selectShot(id:string):void {
        // Select existing shots only.
        if(!this._destroyed && this._shots.some(shot => shot.id === id)){
            // Store selection independently of undo history.
            this._selectedId = id;
            // Refresh active styling and toolbar availability.
            this._state();
        }
    }

    public addShot(shot:Partial<Omit<StoryboardShot, "id">> = {}, index:number = this._shots.length):string {
        // Prepare result.
        let result = "";
        // Respect read-only mode.
        if(this._editable()){
            // Validate new shot fields.
            const [entry] = this._normalize([{title:"Untitled shot", image:"", description:"", camera:"", duration:0, ...shot, id:editorId("shot")}]);
            // Capture the created identifier.
            result = entry.id;
            // Insert at a clamped position.
            this._shots.splice(Number.isFinite(index) ? Math.max(0, Math.min(this._shots.length, Math.trunc(index))) : this._shots.length, 0, entry);
            // Select the new shot.
            this._selectedId = result;
            // Record and render the insertion.
            this._commit(true);
            // Focus the new card's selection control.
            this._focusSelected();
        }
        // Return result.
        return result;
    }

    public updateShot(id:string, patch:Partial<Omit<StoryboardShot, "id">>):void {
        // Locate the requested shot.
        const index = this._shots.findIndex(shot => shot.id === id);
        // Update editable shots only.
        if(this._editable() && index >= 0){
            // Validate the update before applying it.
            const [shot] = this._normalize([{...this._shots[index], ...patch, id}]);
            // Replace the selected shot.
            this._shots[index] = shot;
            // Record and render the change.
            this._commit(true);
        }
    }

    public duplicateShot(id:string = this._selectedId):string {
        // Prepare result.
        let result = "";
        // Locate the requested shot.
        const index = this._shots.findIndex(shot => shot.id === id);
        // Duplicate existing shots only.
        if(index >= 0){
            // Copy metadata without reusing the stable identifier.
            const copy = this._shots[index];
            // Insert a detached copy immediately after the original.
            result = this.addShot({title:`${copy.title} (copy)`, image:copy.image, description:copy.description, camera:copy.camera, duration:copy.duration}, index + 1);
        }
        // Return result.
        return result;
    }

    public removeShot(id:string = this._selectedId):void {
        // Find the requested shot.
        const index = this._shots.findIndex(shot => shot.id === id);
        // Remove editable shots only.
        if(this._editable() && index >= 0){
            // Remove the selected entry.
            this._shots.splice(index, 1);
            // Select the nearest surviving shot.
            this._selectedId = this._shots[Math.min(index, this._shots.length - 1)]?.id || "";
            // Record and render the removal.
            this._commit(true);
            // Restore a predictable keyboard focus location.
            this._focusSelected();
        }
    }

    public moveShot(id:string, index:number):void {
        // Find the original position.
        const from = this._shots.findIndex(shot => shot.id === id);
        // Clamp the target position.
        const to = Math.max(0, Math.min(this._shots.length - 1, Math.trunc(index)));
        // Reorder valid editable shots only.
        if(this._editable() && from >= 0 && Number.isFinite(to) && from !== to){
            // Remove the original entry.
            const [shot] = this._shots.splice(from, 1);
            // Insert at its final position.
            this._shots.splice(to, 0, shot);
            // Preserve selection.
            this._selectedId = id;
            // Record and render the new order.
            this._commit(true);
            // Restore keyboard focus after reordering.
            this._focusSelected();
        }
    }

    public getTotalDuration():number {
        // Prepare result.
        const result = this._shots.reduce((total, shot) => total + shot.duration, 0);
        // Return result.
        return result;
    }

    public toJSON():string {
        // Prepare result.
        const result = JSON.stringify({version:1, shots:this.getShots()}, null, 2);
        // Return result.
        return result;
    }

    public fromJSON(json:string):void {
        // Parse the serialized storyboard.
        const value = JSON.parse(json);
        // Validate its schema version.
        if(value?.version !== 1)
            // Reject unsupported formats without changing the board.
            throw new TypeError("Expected a version 1 storyboard document.");
        // Validate and replace shots atomically.
        this.setShots(value.shots);
    }

    public undo():void {
        // Respect read-only mode.
        if(this._editable())
            // Restore the previous board.
            this._restore(this._history.undo());
    }

    public redo():void {
        // Respect read-only mode.
        if(this._editable())
            // Restore the next board.
            this._restore(this._history.redo());
    }

    public setReadOnly(value:boolean):void {
        // Update live components only.
        if(!this._destroyed){
            // Store the interaction mode.
            this.options.readOnly = value;
            // Apply native control states.
            this._render();
        }
    }

    public canExecute(command:string):boolean {
        // Find the selected position.
        const index = this._shots.findIndex(shot => shot.id === this._selectedId);
        // Prepare result.
        const result = this._editable() && ({add:true, duplicate:index >= 0, remove:index >= 0, up:index > 0, down:index >= 0 && index < this._shots.length - 1, undo:this._history.canUndo, redo:this._history.canRedo}[command] ?? false);
        // Return result.
        return result;
    }

    public execute(command:string):void {
        // Find the selected position.
        const index = this._shots.findIndex(shot => shot.id === this._selectedId);
        // Connect commands to the public API.
        const commands = {add:() => this.addShot(), duplicate:() => this.duplicateShot(), remove:() => this.removeShot(), up:() => this.moveShot(this._selectedId, index - 1), down:() => this.moveShot(this._selectedId, index + 1), undo:() => this.undo(), redo:() => this.redo()};
        // Invoke available commands only.
        if(this.canExecute(command))
            // Execute the requested operation.
            commands[command]();
    }

    public connectToolbar(toolbar:EditorToolbar):() => void {
        // Prepare result.
        let result = ():void => {};
        // Bind live components only.
        if(!this._destroyed){
            // Release any prior binding.
            this._disconnect?.();
            // Connect public commands and selection state.
            result = bindEditorToolbar(this.el, toolbar, command => this.execute(command), command => this.canExecute(command));
            // Retain cleanup for destruction.
            this._disconnect = result;
        }
        // Return result.
        return result;
    }

    public destroy():void {
        // Restore authored content once.
        if(!this._destroyed){
            // Clear any unfinished drag preview.
            this._clearDrag();

            // Prevent further edits.
            this._destroyed = true;
            // Remove all delegated listeners.
            this._controller.abort();
            // Release the external toolbar connection.
            this._disconnect?.();
            // Restore authored nodes.
            this.el.replaceChildren(...this._originalNodes);
            // Remove the component-owned class.
            if(this._addedClass)
                // Preserve classes supplied by the application.
                this.el.classList.remove("storyboard");
            // Release the instance reference.
            delete this.el["M_Storyboard"];
        }
    }

    private _editable():boolean {
        // Prepare result.
        const result = !this._destroyed && !this.options.readOnly;
        // Return result.
        return result;
    }

    private _normalize(value:StoryboardShot[]):StoryboardShot[] {
        // Prepare result.
        const result:StoryboardShot[] = [];
        // Validate the collection shape.
        if(!Array.isArray(value))
            // Reject malformed imports before mutation.
            throw new TypeError("Storyboard shots must be an array.");
        // Track unique identifiers.
        const ids = new Set<string>();
        // Validate each shot.
        for(const shot of value){
            // Validate the required text and timing fields.
            if(!shot || [shot.title, shot.image, shot.description, shot.camera].some(field => typeof field !== "string") || !Number.isFinite(shot.duration) || shot.duration < 0)
                // Explain the accepted shot schema.
                throw new TypeError("Each shot needs title, image, description, camera, and a non-negative duration in seconds.");
            // Resolve non-empty image URLs for scheme validation.
            const url = shot.image ? new URL(shot.image, document.baseURI) : null;
            // Accept ordinary image URLs and raster data URLs only.
            if(url && !["http:", "https:", "blob:"].includes(url.protocol) && !/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(shot.image))
                // Reject executable and unsupported URL schemes.
                throw new TypeError("Frame images require an HTTP(S), relative, blob, or raster data URL.");
            // Preserve unique caller identifiers.
            const id = typeof shot.id === "string" && shot.id && !ids.has(shot.id) ? shot.id : editorId("shot");
            // Reserve the identifier.
            ids.add(id);
            // Copy only supported fields.
            result.push({id, title:shot.title, image:shot.image, description:shot.description, camera:shot.camera, duration:shot.duration});
        }
        // Return result.
        return result;
    }

    private _render():void {
        // Cancel stale drag state before replacing card nodes.
        this._clearDrag();

        // Create each card from literal document fields.
        const cards = this._shots.map((shot, index) => {
            // Prepare result.
            const result = editorElement("article", "storyboard-shot");
            // Associate the card with its stable identifier.
            result.dataset.shotId = shot.id;
            // Create an accessible selection button.
            const select = editorElement("button", "storyboard-shot-select", `Shot ${String(index + 1).padStart(2, "0")}`);
            // Prevent accidental form submission.
            select.type = "button";
            // Mark its selection command.
            select.dataset.shotCommand = "select";
            // Group selection and drag controls in the card header.
            const header = editorElement("div", "storyboard-shot-header");

            // Create a dedicated drag handle so text stays selectable.
            const handle = editorElement("button", "storyboard-drag-handle");

            // Avoid submitting the surrounding form.
            handle.type = "button";

            // Allow dragging only while the board is editable.
            handle.draggable = !this.options.readOnly;

            // Disable the keyboard handle in read-only mode.
            handle.disabled = this.options.readOnly;

            // Explain pointer and keyboard sorting.
            handle.setAttribute("aria-label", `Reorder shot ${index + 1}: drag or use arrow keys`);

            // Add a visible six-dot Material icon.
            const grip = editorElement("i", "material-icons", "drag_indicator");

            // Hide the decorative icon from screen readers.
            grip.setAttribute("aria-hidden", "true");

            // Attach the grip to its handle.
            handle.append(grip);

            // Compose the card header.
            header.append(select, handle);

            // Create a consistent frame area.
            const frame = editorElement("div", "storyboard-frame");
            // Render a frame image when supplied.
            if(shot.image){
                // Create a native image element.
                const image = editorElement("img");
                // Assign the validated image URL.
                image.src = shot.image;
                // Describe the frame accessibly.
                image.alt = shot.title || `Shot ${index + 1}`;
                // Avoid loading offscreen images immediately.
                image.loading = "lazy";
                // Show failed image requests without hiding editable metadata.
                image.addEventListener("error", () => frame.replaceChildren(editorElement("span", "storyboard-image-placeholder", "Frame unavailable")), {once:true});
                // Attach the frame image.
                frame.append(image);
            }else
                // Explain the empty frame state.
                frame.append(editorElement("span", "storyboard-image-placeholder", "Add a frame in shot details"));
            // Create editable shot content.
            const content = editorElement("div", "storyboard-shot-content");
            // Add the primary writing fields.
            content.append(this._field(shot, "title", "Shot title"), this._field(shot, "description", "Action / dialogue", true));
            // Create optional shot metadata controls.
            const details = editorElement("details", "storyboard-details");
            // Add an accessible disclosure summary.
            details.append(editorElement("summary", "", "Frame & camera"));
            // Add image, camera, and timing fields.
            details.append(this._field(shot, "image", "Frame image URL"), this._field(shot, "camera", "Camera / framing"), this._field(shot, "duration", "Duration (seconds)"));
            // Add a compact timing summary.
            const duration = editorElement("span", "storyboard-duration", `${shot.duration}s`);
            // Add reorder and duplicate controls usable without dragging.
            const actions = editorElement("div", "storyboard-shot-actions");
            // Create rounded, labeled icon actions using the shared component.
            for(const [command, label, icon] of [["up", "Earlier", "arrow_back"], ["down", "Later", "arrow_forward"], ["duplicate", "Duplicate", "content_copy"], ["remove", "Delete", "delete_outline"]]){
                // Create the library button component.
                const button = new CrazyButton();

                // Configure the same visual treatment as the toolbar.
                for(const [name, value] of Object.entries({type:"floating", label, size:"small", shape:"round", depth:"flat", "icon-text":icon, "icon-position":"left", variant:"tonal", "color-secondary":"var(--md-sys-color-primary)"}))
                    // Apply each public button option.
                    button.setAttribute(name, value);

                // Store the delegated card command.
                button.dataset.shotCommand = command;

                // Disable unavailable movements and read-only actions.
                button.toggleAttribute("disabled", this.options.readOnly || (command === "up" && index === 0) || (command === "down" && index === this._shots.length - 1));

                // Add the action to the footer.
                actions.append(button);
            }
            // Compose the card content.
            content.append(duration, details);
            // Compose the complete card.
            result.append(header, frame, content, actions);
            // Return result.
            return result;
        });
        // Replace the grid content or show an empty state.
        this._grid.replaceChildren(...(cards.length ? cards : [editorElement("p", "storyboard-empty", "No shots yet. Add a shot to start your storyboard.")]));
        // Refresh selection and command availability.
        this._state();
    }

    private _field(shot:StoryboardShot, field:keyof StoryboardShot, label:string, multiline:boolean = false):HTMLLabelElement {
        // Prepare result.
        const result = editorElement("label", "storyboard-field");
        // Add a visible field label.
        result.append(editorElement("span", "", label));
        // Create a native editable control.
        const input = multiline ? editorElement("textarea", "storyboard-input") : editorElement("input", "storyboard-input");
        // Identify the field for delegated editing.
        input.dataset.shotField = field;
        // Set literal field content.
        input.value = String(shot[field]);
        // Apply read-only interaction.
        input.readOnly = this.options.readOnly;
        // Configure timing validation.
        if(field === "duration" && input instanceof HTMLInputElement){
            // Use native numeric validation.
            input.type = "number";
            // Prevent negative durations.
            input.min = "0";
            // Allow fractional seconds.
            input.step = "any";
        }
        // Add the labeled control.
        result.append(input);
        // Return result.
        return result;
    }

    private _state():void {
        // Refresh card selection without replacing focused controls.
        for(const card of this._grid.querySelectorAll<HTMLElement>(".storyboard-shot")){
            // Resolve selected state.
            const active = card.dataset.shotId === this._selectedId;
            // Apply visual selection.
            card.classList.toggle("is-selected", active);
            // Expose selection on the corresponding toggle button.
            card.querySelector(".storyboard-shot-select")?.setAttribute("aria-pressed", String(active));
        }
        // Show shot count and duration.
        this._status.textContent = `${this._shots.length} shots · ${Number(this.getTotalDuration().toFixed(2))} seconds${this.options.readOnly ? " · Read only" : ""}`;
        // Notify selection listeners with detached data.
        this.el.dispatchEvent(new CustomEvent("storyboardselectionchange", {bubbles:true, detail:{shot:this.getSelectedShot()}}));
        // Update connected toolbar controls.
        this.el.dispatchEvent(new CustomEvent("editorstatechange"));
    }

    private _commit(render:boolean):void {
        // Record the document change.
        this._history.commit(this._shots);
        // Rebuild cards only when structure or frame images change.
        if(render)
            // Render the new structure.
            this._render();
        else
            // Keep the active native input and caret intact.
            this._state();
        // Notify persistence integrations.
        this._emitChange();
    }

    private _emitChange():void {
        // Keep public options synchronized.
        this.options.shots = this.getShots();
        // Dispatch detached document data.
        this.el.dispatchEvent(new CustomEvent("storyboardchange", {bubbles:true, detail:{shots:this.getShots()}}));
        // Notify the optional callback.
        this.options.onChange?.(this.getShots());
    }

    private _restore(shots:StoryboardShot[]|undefined):void {
        // Apply available history only.
        if(shots){
            // Restore the detached document.
            this._shots = shots;
            // Keep selection valid.
            if(!shots.some(shot => shot.id === this._selectedId))
                // Select the first available shot.
                this._selectedId = shots[0]?.id || "";
            // Render restored cards.
            this._render();
            // Notify consumers without creating history.
            this._emitChange();
            // Restore keyboard focus after undo or redo.
            this._focusSelected();
        }
    }

    private _focusSelected():void {
        // Locate the selected card without using document IDs as selectors.
        const card = Array.from(this._grid.querySelectorAll<HTMLElement>(".storyboard-shot")).find(item => item.dataset.shotId === this._selectedId);
        // Focus the selected card's control.
        card?.querySelector<HTMLButtonElement>(".storyboard-shot-select")?.focus({preventScroll:true});
    }

    private _onFocus = (event:FocusEvent):void => {
        // Resolve the containing shot.
        const card = (event.target as Element).closest<HTMLElement>(".storyboard-shot");
        // Select focused shots.
        if(card)
            // Keep toolbar actions bound to the current card.
            this.selectShot(card.dataset.shotId || "");
    };

    private _onClick = (event:Event):void => {
        // Resolve a card action.
        const button = (event.target as Element).closest<HTMLElement>("[data-shot-command]");
        // Execute enabled actions only.
        if(button && !button.hasAttribute("disabled") && (event.type === "buttonaction" || button.tagName !== "CRAZY-BUTTON")){
            // Prevent default form behavior.
            event.preventDefault();
            // Select the action's card first.
            this.selectShot(button.closest<HTMLElement>(".storyboard-shot")?.dataset.shotId || "");
            // Route editing commands through the public API.
            if(button.dataset.shotCommand !== "select")
                // Apply the selected command.
                this.execute(button.dataset.shotCommand || "");
        }
    };

    private _onDragStart = (event:DragEvent):void => {
        // Resolve a dedicated handle inside this board.
        const handle = (event.target as Element).closest<HTMLButtonElement>(".storyboard-drag-handle");

        // Resolve the source card.
        const card = handle?.closest<HTMLElement>(".storyboard-shot");

        // Start only editable, handle-initiated drags.
        if(this._editable() && card && this._grid.contains(card) && event.dataTransfer){
            // Record ownership without trusting external drop payloads.
            this._draggedId = card.dataset.shotId || "";

            // Select the card being moved.
            this.selectShot(this._draggedId);

            // Advertise a local move operation.
            event.dataTransfer.effectAllowed = "move";

            // Supply native drag data for browsers that require it.
            event.dataTransfer.setData("text/plain", this._draggedId);

            // Show the whole card under the pointer while sorting.
            event.dataTransfer.setDragImage(card, Math.min(card.offsetWidth / 2, 100), 24);

            // Dim the source while preserving the grid layout.
            card.classList.add("is-dragging");
        }else
            // Keep images and editable text from becoming sortable cards.
            event.preventDefault();
    };

    private _onDragOver = (event:DragEvent):void => {
        // Resolve the card under the pointer.
        const card = (event.target as Element).closest<HTMLElement>(".storyboard-shot");

        // Reset the previous insertion preview.
        this._clearDrop();

        // Accept only a drag owned by this editable board.
        if(this._editable() && this._draggedId && card && this._grid.contains(card) && card.dataset.shotId !== this._draggedId){
            // Allow a native drop at this destination.
            event.preventDefault();

            // Show a move cursor.
            if(event.dataTransfer)
                // Advertise the allowed operation.
                event.dataTransfer.dropEffect = "move";

            // Measure the target card and responsive grid.
            const bounds = card.getBoundingClientRect();

            // Detect whether cards are laid out in one or several columns.
            const columns = getComputedStyle(this._grid).gridTemplateColumns.split(" ").length;

            // Use vertical halves for one column and horizontal halves for a grid.
            const after = columns === 1 ? event.clientY > bounds.top + bounds.height / 2 : event.clientX > bounds.left + bounds.width / 2;

            // Find the source document index.
            const from = this._shots.findIndex(shot => shot.id === this._draggedId);

            // Find the insertion boundary around the target.
            const insertion = this._shots.findIndex(shot => shot.id === card.dataset.shotId) + (after ? 1 : 0);

            // Convert the boundary into a final index after removing the source.
            this._dropIndex = insertion - (from < insertion ? 1 : 0);

            // Orient insertion feedback to the actual responsive grid.
            card.classList.toggle("is-drop-vertical", columns === 1);

            // Mark the insertion side without shifting editable controls.
            card.classList.add(after ? "is-drop-after" : "is-drop-before");
        }
    };

    private _onDrop = (event:DragEvent):void => {
        // Accept only a valid local insertion preview.
        if(this._editable() && this._draggedId && this._dropIndex >= 0){
            // Prevent native text insertion or navigation.
            event.preventDefault();

            // Capture the source before clearing the preview.
            const id = this._draggedId;

            // Capture the final destination.
            const index = this._dropIndex;

            // Clear visual state before rendering the reordered board.
            this._clearDrag();

            // Commit a single undoable move through the public API.
            this.moveShot(id, index);

            // Announce the completed destination.
            this._status.textContent = `Moved shot to position ${index + 1} of ${this._shots.length}.`;
        }
    };

    private _onDragLeave = (event:DragEvent):void => {
        // Clear stale destinations when the pointer leaves the board.
        if(!(event.relatedTarget instanceof Node) || !this.el.contains(event.relatedTarget))
            // Preserve the active drag while removing its old preview.
            this._clearDrop();
    };

    private _clearDrop():void {
        // Remove insertion previews from every card.
        for(const card of this._grid.querySelectorAll(".is-drop-before, .is-drop-after"))
            // Restore the card's ordinary border treatment.
            card.classList.remove("is-drop-before", "is-drop-after", "is-drop-vertical");

        // Invalidate the previous destination.
        this._dropIndex = -1;
    }

    private _clearDrag = ():void => {
        // Remove insertion feedback.
        this._clearDrop();

        // Restore the source card's appearance.
        for(const card of this._grid.querySelectorAll(".is-dragging"))
            // Remove transient opacity.
            card.classList.remove("is-dragging");

        // Release local drag ownership.
        this._draggedId = "";
    };

    private _onInput = (event:Event):void => {
        // Resolve the edited control.
        const input = event.target as HTMLInputElement|HTMLTextAreaElement;
        // Locate its document entry.
        const shot = this._shots.find(item => item.id === input.closest<HTMLElement>(".storyboard-shot")?.dataset.shotId);
        // Update metadata without replacing the focused native control.
        if(this._editable() && shot && input.dataset.shotField !== "image"){
            // Read the metadata key.
            const field = input.dataset.shotField;
            // Update literal text fields.
            if(["title", "description", "camera"].includes(field || ""))
                // Store the current input text.
                shot[field] = input.value;
            else if(field === "duration" && input.value !== "" && Number.isFinite(Number(input.value)) && Number(input.value) >= 0)
                // Store valid numeric duration.
                shot.duration = Number(input.value);
            // Update the visible duration label.
            input.closest(".storyboard-shot")?.querySelector(".storyboard-duration")?.replaceChildren(`${shot.duration}s`);
            // Record the edit.
            this._commit(false);
        }
    };

    private _onChange = (event:Event):void => {
        // Resolve an edited image URL.
        const input = event.target as HTMLInputElement;
        // Apply image changes after the user completes the field.
        if(this._editable() && input.dataset.shotField === "image"){
            // Validate before rebuilding the image card.
            try {
                // Clear previous browser validation feedback.
                input.setCustomValidity("");
                // Apply the public validated mutation.
                this.updateShot(input.closest<HTMLElement>(".storyboard-shot")?.dataset.shotId || "", {image:input.value});
            }catch(error){
                // Explain rejected image schemes without changing shot data.
                input.setCustomValidity(error instanceof Error ? error.message : "Invalid image URL");
                // Display native validation feedback.
                input.reportValidity();
            }
        }
    };

    private _onBeforeInput = (event:InputEvent):void => {
        // Keep native undo gestures synchronized with board history.
        if(event.inputType === "historyUndo" || event.inputType === "historyRedo"){
            // Prevent a separate history inside each input.
            event.preventDefault();
            // Restore the requested board snapshot.
            this.execute(event.inputType === "historyUndo" ? "undo" : "redo");
        }
    };

    private _onKeydown = (event:KeyboardEvent):void => {
        // Resolve keyboard sorting from a dedicated grip only.
        const handle = (event.target as Element).closest<HTMLButtonElement>(".storyboard-drag-handle");

        // Let keyboard users move cards without a pointer.
        if(this._editable() && handle && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)){
            // Prevent the arrow from scrolling the page.
            event.preventDefault();

            // Capture the handle's card identity.
            const id = handle.closest<HTMLElement>(".storyboard-shot")?.dataset.shotId || "";

            // Find its current document position.
            const index = this._shots.findIndex(shot => shot.id === id);

            // Reorder through the shared history method.
            this.moveShot(id, index + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1));

            // Locate the moved card after rendering.
            const card = Array.from(this._grid.querySelectorAll<HTMLElement>(".storyboard-shot")).find(item => item.dataset.shotId === id);

            // Keep repeated arrow moves on the grip.
            card?.querySelector<HTMLButtonElement>(".storyboard-drag-handle")?.focus();
        }

        // Preserve IME composition while sharing document history shortcuts.
        if(this._editable() && !event.isComposing && (event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())){
            // Prevent independent native input history.
            event.preventDefault();
            // Restore the requested document state.
            this.execute(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
        }
    };
}
