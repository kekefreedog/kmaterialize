/** Bounded, detached history for serializable editor documents. */
export class EditorHistory<T> {
    private _entries:T[] = [];
    private _index:number = -1;

    public constructor(initial:T, private _limit:number = 101){
        // Keep a detached initial state.
        this.commit(initial);
    }

    public get canUndo():boolean {
        // Prepare result.
        const result = this._index > 0;
        // Return result.
        return result;
    }

    public get canRedo():boolean {
        // Prepare result.
        const result = this._index < this._entries.length - 1;
        // Return result.
        return result;
    }

    public commit(value:T):void {
        // Ignore duplicate document states.
        if(JSON.stringify(value) !== JSON.stringify(this._entries[this._index])){
            // Discard the redo branch.
            this._entries.splice(this._index + 1);
            // Store a detached snapshot.
            this._entries.push(structuredClone(value));
            // Enforce the history bound.
            if(this._entries.length > this._limit)
                // Release the oldest state.
                this._entries.shift();
            // Select the newest state.
            this._index = this._entries.length - 1;
        }
    }

    /** Update selection metadata without creating a document edit. */
    public replaceCurrent(value:T):void {
        // Replace the current detached snapshot in place.
        this._entries[this._index] = structuredClone(value);
    }

    public undo():T|undefined {
        // Prepare result.
        let result:T|undefined;
        // Restore the previous snapshot when available.
        if(this.canUndo){
            // Move the cursor.
            this._index--;
            // Copy the selected snapshot.
            result = structuredClone(this._entries[this._index]);
        }
        // Return result.
        return result;
    }

    public redo():T|undefined {
        // Prepare result.
        let result:T|undefined;
        // Restore the next snapshot when available.
        if(this.canRedo){
            // Move the cursor.
            this._index++;
            // Copy the selected snapshot.
            result = structuredClone(this._entries[this._index]);
        }
        // Return result.
        return result;
    }
}
