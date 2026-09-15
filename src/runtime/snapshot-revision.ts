/**
 * Cheap generation counter for Observatory snapshots.
 *
 * The host plugin used to JSON.stringify the full snapshot every 400ms to detect
 * changes. Registries and the trace store bump this instead; stringify only happens
 * when a snapshot is actually sent.
 */

let revision = 0

export function bumpSnapshotRevision(): void {
    revision += 1
}

export function getSnapshotRevision(): number {
    return revision
}

export function resetSnapshotRevision(): void {
    revision = 0
}
