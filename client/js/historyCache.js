/* Memory-only cache. A changed envelope must always be decrypted again. */
(function(root) {
    class HistoryCache {
        constructor(limit = 1000) { this.entries = new Map(); this.limit = limit; this.generation = 0; }
        clear() { this.entries.clear(); this.generation++; }
        async resolve(row, decrypt) {
            const source = JSON.stringify(row), cached = this.entries.get(row.id);
            if (cached?.source === source) return cached.text;
            this.entries.delete(row.id);
            const generation = this.generation, text = await decrypt(row);
            if (generation === this.generation) {
                this.entries.set(row.id, {source, text});
                if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
            }
            return text;
        }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = HistoryCache;
    else root.HistoryCache = HistoryCache;
})(globalThis);
