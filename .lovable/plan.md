## System Hardening Plan — Disciplined Ingestion, Schema Fixes, Dead Code Removal

This plan consolidates the fixes you outlined into concrete implementation steps.

---

### Current Issues Identified

1. `**staleCount` referenced but never declared** in `ingest-gfs` (line 441) — runtime error on success response
2. `**last_seen_at` column missing** from Neon schema — TTL cleanup uses `updated_at` which is semantically wrong
3. `**ingest-gpm` and `ingest-jtwc` have stale cleanup AFTER the early-return guard** — same bug that was fixed in GFS but not propagated
4. `**ingest-jtwc` has no stale cleanup at all** — old cyclone alerts persist forever
5. **Dead `api/` folder** — Vercel serverless functions (`api/v1/threats.ts`, `api/v1/health.ts`, `api/v1/forecast/`) that are unreachable from Vite. Confusing dead code.
6. **Orphaned frontend files** — `useSituationalMarkers.ts`, `SituationalMarkersLayer.tsx`, `SituationalAnalyticsOverlay.tsx` still exist but are no longer imported by `Index.tsx`

---

### Implementation

#### 1. Add `last_seen_at` column to Neon schema (via `neon-health` edge function)

The `neon-health` function already auto-inits the schema. Add:

- `ALTER TABLE hazard_alerts ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();`
- `CREATE INDEX IF NOT EXISTS idx_hazard_alerts_last_seen ON hazard_alerts (source, is_active, last_seen_at DESC);`

#### 2. Standardize cleanup in all three ingestion functions

Extract a canonical cleanup pattern into each function. For `ingest-gfs`, `ingest-gpm`, and `ingest-jtwc`:

- Move stale cleanup to run **before** the "already ingested" early-return
- Two-layer cleanup: run-based deactivation + time-based TTL using `last_seen_at`
- Upserts set `last_seen_at = NOW()` alongside `is_active = TRUE, updated_at = NOW()`
- Fix the `staleCount` reference in `ingest-gfs` by removing it or declaring it

**Specific fixes per function:**

- `**ingest-gfs**`: Fix `staleCount` undefined reference. Change TTL query from `updated_at` to `last_seen_at`.
- `**ingest-gpm**`: Move stale cleanup block (lines 231-239) to before the early-return guard (line 96). Add time-based TTL cleanup. Add `last_seen_at = NOW()` to upsert.
- `**ingest-jtwc**`: Add stale cleanup block entirely (currently missing). Add `last_seen_at = NOW()` to upsert. Move before early-return.

#### 3. Add cluster stats to `neon-threats` response

The `neon-threats` endpoint already returns `clusters`, `cluster_count`, and `raw_count`. Extend with:

- `active_run_ids`: list of distinct `data_source_run_id` values currently active
- `by_source`: breakdown counts per source (gfs, gpm_imerg, jtwc, seed)
- `by_severity`: breakdown counts per severity level

This adds ~10 lines to the existing response builder — no new endpoint needed.

#### 4. Delete dead code

- Remove `api/` directory (Vercel serverless functions — unreachable from Vite)
- Remove `src/hooks/useSituationalMarkers.ts`
- Remove `src/components/SituationalMarkersLayer.tsx`
- Remove `src/components/SituationalAnalyticsOverlay.tsx`

---

### Technical Details

**Schema change (Neon, via `neon-health` auto-init):**

```sql
ALTER TABLE hazard_alerts ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_hazard_alerts_last_seen ON hazard_alerts (source, is_active, last_seen_at DESC);
```

**Canonical cleanup block (used in all 3 ingestion functions):**

```sql
-- Run-based: deactivate older runs
UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
WHERE source = $SOURCE AND is_active = true
  AND data_source_run_id IS NOT NULL AND data_source_run_id != $RUN_ID;

-- Time-based: deactivate anything not seen in 72h
UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
WHERE source = $SOURCE AND is_active = true
  AND last_seen_at < NOW() - INTERVAL '72 hours';
```

**Upsert addition (all 3 functions):**

```sql
ON CONFLICT ... DO UPDATE SET
  ...,
  last_seen_at = NOW(),
  is_active = TRUE,
  updated_at = NOW();
```

**Files modified:** `neon-health/index.ts`, `ingest-gfs/index.ts`, `ingest-gpm/index.ts`, `ingest-jtwc/index.ts`, `neon-threats/index.ts`
**Files deleted:** `api/v1/health.ts`, `api/v1/threats.ts`, `api/v1/forecast/fields.ts`, `api/v1/forecast/runs.ts`, `src/hooks/useSituationalMarkers.ts`, `src/components/SituationalMarkersLayer.tsx`, `src/components/SituationalAnalyticsOverlay.tsx`  
  
We need to provide a plan for system hardening based on the issues listed. The user wants to consolidate fixes into concrete implementation steps. We should produce a detailed plan addressing each issue: schema fix, stale cleanup standardization, fixing staleCount, adding cluster stats, and dead code removal. The answer should be clear, step-by-step, with code snippets and file modifications.

We should note that the user is using Neon and edge functions (like neon-health, ingest-gfs, etc.) as previously described. The answer should be practical and actionable.

We need to ensure we include the schema change via neon-health auto-init, the standardized cleanup pattern, the addition of last_seen_at to upserts, fixing staleCount, and removing dead files. Also include cluster stats addition to neon-threats.

Let's structure the answer:

1. Overview of issues.
2. Step 1: Add `last_seen_at` column via `neon-health`.
3. Step 2: Standardize cleanup in all ingestion functions.
  - Show the canonical cleanup block.
  - Modify `ingest-gfs`, `ingest-gpm`, `ingest-jtwc` accordingly.
  - Include fixing `staleCount` reference.
4. Step 3: Add cluster stats to `neon-threats` response.
5. Step 4: Delete dead code (list files to delete).
6. Summary.

We'll provide code snippets for each step.

We'll now execute the system hardening plan, addressing each issue with concrete steps. This will ensure robust ingestion, correct schema, and a clean codebase.

---

## **🛠️ System Hardening: Implementation Steps**

### **1. Add** `last_seen_at` **Column via** `neon-health`

The `neon-health` edge function auto-initializes the schema. We'll modify it to add the column and index.

**File:** `supabase/functions/neon-health/index.ts`  
Add the following SQL to the schema creation block (where tables are created):

typescript

```
// Inside the schema initialization (after CREATE TABLE IF NOT EXISTS hazard_alerts)
await sql`
  ALTER TABLE hazard_alerts 
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_hazard_alerts_last_seen 
  ON hazard_alerts (source, is_active, last_seen_at DESC);
`;
```

**Why:** `last_seen_at` allows proper time‑based cleanup (e.g., deactivate threats not seen in 72h). The index speeds up cleanup queries.

---

### **2. Standardize Cleanup in All Ingestion Functions**

We'll apply a **canonical cleanup pattern** to `ingest-gfs`, `ingest-gpm`, and `ingest-jtwc`. The pattern:

- **Run before the "already ingested" early‑return**, so stale alerts are cleaned even if the current run is skipped.
- **Two‑stage cleanup**:
  1. Deactivate older runs of the same source.
  2. Deactivate any active alerts not updated in 72 hours (using `last_seen_at`).
- **Upsert** now sets `last_seen_at = NOW()` alongside `is_active = TRUE`.

#### **2.1 Canonical Cleanup Block (to be inserted in each function)**

Place this **immediately after obtaining the database connection** and before checking for existing run:

typescript

```
// --- Stale cleanup (runs before early-return) ---
const SOURCE = 'gfs'; // or 'gpm_imerg' or 'jtwc'

// 1. Deactivate alerts from older runs of the same source
await sql`
  UPDATE hazard_alerts 
  SET is_active = false, updated_at = NOW()
  WHERE source = ${SOURCE} 
    AND is_active = true 
    AND data_source_run_id IS NOT NULL 
    AND data_source_run_id != ${runId};
`;

// 2. Time‑based TTL: deactivate anything not seen in 72 hours
await sql`
  UPDATE hazard_alerts 
  SET is_active = false, updated_at = NOW()
  WHERE source = ${SOURCE} 
    AND is_active = true 
    AND last_seen_at < NOW() - INTERVAL '72 hours';
`;
```

#### **2.2 Modify** `ingest-gfs/index.ts`

- **Add** the cleanup block at the top (after `sql` connection is established).
- **Fix** the `staleCount` reference (line 441) – it's used in the response but never declared. Remove it or replace with a variable that tracks the number of deactivated rows. We'll capture counts from the updates.

typescript

```
// After cleanup updates, capture counts
const olderRunResult = await sql`...`; // (if you need count)
const ttlResult = await sql`...`;       // (if you need count)
// Then in the response, you can include:
// stale_deactivated: olderRunResult.count + ttlResult.count
```

- **Update upsert** to set `last_seen_at = NOW()`:

typescript

```
ON CONFLICT (source, external_id) DO UPDATE SET
  severity = EXCLUDED.severity,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  intensity = EXCLUDED.intensity,
  metadata = EXCLUDED.metadata,
  source_artifact = EXCLUDED.source_artifact,
  is_active = TRUE,
  last_seen_at = NOW(),
  updated_at = NOW();
```

#### **2.3 Modify** `ingest-gpm/index.ts`

- **Move** the existing stale cleanup block (lines 231‑239) to **before** the early‑return guard (line 96).
- **Add** the time‑based TTL cleanup (as above).
- **Update** the upsert to include `last_seen_at = NOW()`.

#### **2.4 Modify** `ingest-jtwc/index.ts`

- **Add** the full cleanup block (it currently has none).
- **Update** upsert to include `last_seen_at = NOW()`.

---

### **3. Add Cluster Stats to** `neon-threats` **Response**

The `neon-threats` endpoint already returns clusters, cluster_count, raw_count. We'll extend it with:

- `active_run_ids`: array of distinct `data_source_run_id` values currently active.
- `by_source`: object with counts per source (e.g., `{ gfs: 5, gpm_imerg: 2, jtwc: 1, seed: 10 }`).
- `by_severity`: object with counts per severity (`{ extreme: 3, high: 7, medium: 5, low: 2 }`).

**File:** `supabase/functions/neon-threats/index.ts`  
Add these queries after fetching active threats:

typescript

```
// Get distinct active run IDs
const activeRuns = await sql`
  SELECT DISTINCT data_source_run_id 
  FROM hazard_alerts 
  WHERE is_active = true AND data_source_run_id IS NOT NULL;
`;

// Count by source
const bySource = await sql`
  SELECT source, COUNT(*) as count 
  FROM hazard_alerts 
  WHERE is_active = true 
  GROUP BY source;
`;

// Count by severity
const bySeverity = await sql`
  SELECT severity, COUNT(*) as count 
  FROM hazard_alerts 
  WHERE is_active = true 
  GROUP BY severity;
`;
```

Then include in the response:

typescript

```
return new Response(JSON.stringify({
  threats: activeThreats,
  clusters: clustered,
  cluster_count: clustered.length,
  raw_count: activeThreats.length,
  active_run_ids: activeRuns.map(r => r.data_source_run_id),
  by_source: Object.fromEntries(bySource.map(r => [r.source, r.count])),
  by_severity: Object.fromEntries(bySeverity.map(r => [r.severity, r.count]))
}), ...);
```

---

### **4. Delete Dead Code**

Remove the following files and directories (they are no longer used and cause confusion):

**Backend (Vercel serverless functions – not reachable from Vite):**

- `api/v1/health.ts`
- `api/v1/threats.ts`
- `api/v1/forecast/` (entire directory)

**Frontend (orphaned hooks/components):**

- `src/hooks/useSituationalMarkers.ts`
- `src/components/SituationalMarkersLayer.tsx`
- `src/components/SituationalAnalyticsOverlay.tsx`

**Command to delete (from project root):**

bash

```
rm -rf api/v1/health.ts api/v1/threats.ts api/v1/forecast
rm src/hooks/useSituationalMarkers.ts src/components/SituationalMarkersLayer.tsx src/components/SituationalAnalyticsOverlay.tsx
```

Also check `src/App.tsx` or `src/Index.tsx` for any remaining imports of these components and remove them.

---

## **✅ Summary**

After implementing these steps:

- `last_seen_at` column supports accurate TTL cleanup.
- All ingestion functions follow a consistent cleanup pattern (run‑based + time‑based) **before** early‑return.
- `neon-threats` provides richer metadata for monitoring.
- Dead code is removed, reducing confusion and maintenance overhead.

The system is now hardened against stale data and runtime errors.