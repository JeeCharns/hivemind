/**
 * K-Means Clustering
 *
 * Groups similar embeddings into clusters
 * Follows SRP: single responsibility of clustering
 */

import kmeans from "ml-kmeans";

/**
 * Determine optimal number of clusters using elbow method
 *
 * @param embeddings - Array of embedding vectors
 * @param maxClusters - Maximum number of clusters to try
 * @returns Optimal number of clusters
 */
function determineOptimalClusters(
  embeddings: number[][],
  maxClusters: number = 8
): number {
  const n = embeddings.length;

  // Handle edge cases
  if (n <= 2) return 1;
  if (n <= 5) return Math.min(2, n);

  // Try different cluster counts and find elbow
  const maxK = Math.min(maxClusters, Math.floor(n / 3));
  const distortions: number[] = [];

  for (let k = 1; k <= maxK; k++) {
    const result = kmeans(embeddings, k, { initialization: "kmeans++" });
    distortions.push(result.computeInformation(embeddings).distortion);
  }

  // Simple elbow detection: find point with max angle
  let bestK = 2;
  let maxAngle = 0;

  for (let i = 1; i < distortions.length - 1; i++) {
    const angle =
      distortions[i - 1] - 2 * distortions[i] + distortions[i + 1];
    if (angle > maxAngle) {
      maxAngle = angle;
      bestK = i + 1;
    }
  }

  return Math.max(2, Math.min(bestK, 6)); // Cap at 6 clusters for UX
}

/**
 * Cluster embeddings using K-Means
 *
 * @param embeddings - Array of embedding vectors
 * @param numClusters - Optional: number of clusters (auto-determined if not provided)
 * @returns Array of cluster indices
 */
export function clusterEmbeddings(
  embeddings: number[][],
  numClusters?: number
): number[] {
  if (embeddings.length === 0) {
    return [];
  }

  // Single item
  if (embeddings.length === 1) {
    return [0];
  }

  try {
    const k = numClusters ?? determineOptimalClusters(embeddings);
    const result = kmeans(embeddings, k, {
      initialization: "kmeans++",
      seed: 42, // Deterministic for testing
    });

    return result.clusters;
  } catch (error) {
    console.error("[clusterEmbeddings] K-Means failed:", error);
    throw new Error(
      `Clustering failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Get cluster statistics
 *
 * @param clusterIndices - Array of cluster assignments
 * @returns Map of cluster index to size
 */
export function getClusterStats(
  clusterIndices: number[]
): Map<number, number> {
  const stats = new Map<number, number>();

  for (const idx of clusterIndices) {
    stats.set(idx, (stats.get(idx) || 0) + 1);
  }

  return stats;
}
