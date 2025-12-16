/**
 * Dimension Reduction with UMAP
 *
 * Reduces high-dimensional embeddings to 2D for visualization
 * Follows SRP: single responsibility of dimension reduction
 */

import { UMAP } from "umap-js";

/**
 * Reduce embeddings to 2D using UMAP
 *
 * @param embeddings - Array of high-dimensional embedding vectors
 * @returns Array of 2D coordinates [x, y]
 */
export function reduceToTwoD(embeddings: number[][]): number[][] {
  if (embeddings.length === 0) {
    return [];
  }

  // Single point doesn't need reduction
  if (embeddings.length === 1) {
    return [[0, 0]];
  }

  // Two points can be placed on a line
  if (embeddings.length === 2) {
    return [
      [-1, 0],
      [1, 0],
    ];
  }

  try {
    const umap = new UMAP({
      nComponents: 2,
      nNeighbors: Math.min(15, embeddings.length - 1),
      minDist: 0.1,
      spread: 1.0,
    });

    const reduced = umap.fit(embeddings);
    return reduced;
  } catch (error) {
    console.error("[reduceToTwoD] UMAP failed:", error);
    throw new Error(
      `Dimension reduction failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
