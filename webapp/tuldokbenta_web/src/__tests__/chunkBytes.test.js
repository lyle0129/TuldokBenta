/**
 * Property-based tests for chunkBytes()
 *
 * Feature: ble-receipt-printing
 *
 * Validates: Requirements 3.1, 3.4, 3.6
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { chunkBytes } from '../utils/buildEscPos';

// ---------------------------------------------------------------------------
// Property 4: Chunk decomposition is a lossless partition
// Tag: Feature: ble-receipt-printing, Property 4: chunk decomposition is lossless
// Validates: Requirements 3.1, 3.4, 3.6
// ---------------------------------------------------------------------------

describe('chunkBytes — Property 4: chunk decomposition is lossless', () => {
  it('chunk count, sizes, and concatenation all hold for arbitrary inputs', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 2048 }),
        fc.integer({ min: 1, max: 512 }),
        (bytes, chunkSize) => {
          const chunks = chunkBytes(bytes, chunkSize);
          const N = bytes.length;
          const C = chunkSize;

          // Correct count
          const expectedCount = N === 0 ? 0 : Math.ceil(N / C);
          expect(chunks.length).toBe(expectedCount);

          // Every chunk is a Uint8Array with length ≤ chunkSize
          for (const chunk of chunks) {
            expect(chunk).toBeInstanceOf(Uint8Array);
            expect(chunk.length).toBeGreaterThanOrEqual(1);
            expect(chunk.length).toBeLessThanOrEqual(C);
          }

          // Concatenation equals the original
          const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
          expect(totalLength).toBe(N);

          const concat = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            concat.set(chunk, offset);
            offset += chunk.length;
          }
          expect(concat).toEqual(bytes);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Example-based unit tests
// ---------------------------------------------------------------------------

describe('chunkBytes — unit examples', () => {
  it('empty array produces no chunks', () => {
    expect(chunkBytes(new Uint8Array(0), 10)).toEqual([]);
  });

  it('array smaller than chunk size produces a single chunk', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const chunks = chunkBytes(bytes, 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('array exactly chunk size produces a single chunk', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const chunks = chunkBytes(bytes, 3);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(bytes);
  });

  it('array of 7 bytes with chunk size 3 produces 3 chunks', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
    const chunks = chunkBytes(bytes, 3);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(chunks[1]).toEqual(new Uint8Array([4, 5, 6]));
    expect(chunks[2]).toEqual(new Uint8Array([7]));
  });

  it('chunk size of 1 produces one chunk per byte', () => {
    const bytes = new Uint8Array([10, 20, 30]);
    const chunks = chunkBytes(bytes, 1);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual(new Uint8Array([10]));
    expect(chunks[1]).toEqual(new Uint8Array([20]));
    expect(chunks[2]).toEqual(new Uint8Array([30]));
  });

  it('chunk size equal to array length produces exactly one chunk', () => {
    const bytes = new Uint8Array([5, 10, 15, 20]);
    const chunks = chunkBytes(bytes, 4);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(bytes);
  });

  it('throws RangeError for chunkSize of 0', () => {
    expect(() => chunkBytes(new Uint8Array([1, 2, 3]), 0)).toThrow(RangeError);
  });

  it('throws RangeError for negative chunkSize', () => {
    expect(() => chunkBytes(new Uint8Array([1, 2, 3]), -1)).toThrow(RangeError);
  });
});
