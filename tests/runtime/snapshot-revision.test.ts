import { describe, expect, it } from 'vitest'
import { bumpSnapshotRevision, getSnapshotRevision, resetSnapshotRevision } from '../../src/runtime/snapshot-revision'

describe('snapshot revision', () => {
    it('increments independently of snapshot payload size', () => {
        resetSnapshotRevision()

        expect(getSnapshotRevision()).toBe(0)

        bumpSnapshotRevision()
        bumpSnapshotRevision()

        expect(getSnapshotRevision()).toBe(2)
    })
})
