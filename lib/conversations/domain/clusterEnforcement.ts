/**
 * Cluster Enforcement - Domain Helper
 *
 * Enforces minimum cluster count via post-processing splits
 * Applies only to full analysis runs (not incremental)
 * Follows SRP: single responsibility of cluster floor enforcement
 */

import kmeans from "ml-kmeans";
import {
  MIN_CLUSTERS_SMALL,
  MIN_CLUSTERS_LARGE,
  MIN_FORCED_CLUSTER_SIZE,
  MISC_CLUSTER_INDEX,
} from "./thresholds";

/**
 * Result of enforcing minimum clusters
 */
export interface EnforceMinClustersResult {
  /** Updated cluster indices after forced splits */
  clusterIndices: number[];
  /** Number of splits performed */
  splitsPerformed: number;
  /** Target minimum clusters (may not be achieved) */
  targetMinClusters: number;
  /** Effective minimum clusters (respects feasibility) */
  effectiveMinClusters: number;
  /** Final non-misc cluster count */
  finalClusterCount: number;
  /** Reason if target was not achieved */
  reason?: string;
}

/**
 * Determine target minimum clusters based on response count
 *
 * @param responseCount - Total number of responses
 * @returns Target minimum clusters
 */
function determineTargetMinClusters(responseCount: number): number {
  if (responseCount <= 40) {
    return MIN_CLUSTERS_SMALL;
  }
  return MIN_CLUSTERS_LARGE;
}

/**
 * Compute effective minimum clusters respecting feasibility constraints
 *
 * @param targetMin - Target minimum clusters
 * @param responseCount - Total number of responses
 * @returns Effective minimum clusters (never exceeds n or floor(n / minForcedClusterSize))
 */
function computeEffectiveMinClusters(
  targetMin: number,
  responseCount: number
): number {
  // Never exceed n
  let effective = Math.min(targetMin, responseCount);

  // Never exceed floor(n / minForcedClusterSize) to prevent tiny clusters
  const maxClustersForSize = Math.floor(
    responseCount / MIN_FORCED_CLUSTER_SIZE
  );
  effective = Math.min(effective, maxClustersForSize);

  return effective;
}

/**
 * Count non-misc clusters
 *
 * @param clusterIndices - Cluster assignments
 * @returns Count of non-misc clusters
 */
function countNonMiscClusters(clusterIndices: number[]): number {
  const uniqueClusters = new Set(
    clusterIndices.filter((idx) => idx !== MISC_CLUSTER_INDEX)
  );
  return uniqueClusters.size;
}

/**
 * Get cluster sizes (excluding misc)
 *
 * @param clusterIndices - Cluster assignments
 * @returns Map of cluster index to size
 */
function getClusterSizes(clusterIndices: number[]): Map<number, number> {
  const sizes = new Map<number, number>();
  for (const idx of clusterIndices) {
    if (idx === MISC_CLUSTER_INDEX) continue;
    sizes.set(idx, (sizes.get(idx) || 0) + 1);
  }
  return sizes;
}

/**
 * Find largest eligible cluster for splitting
 *
 * @param clusterIndices - Cluster assignments
 * @returns Cluster index to split, or null if none eligible
 */
function findLargestEligibleCluster(clusterIndices: number[]): number | null {
  const sizes = getClusterSizes(clusterIndices);

  // Find largest cluster with size >= 2 * MIN_FORCED_CLUSTER_SIZE
  const minSizeForSplit = 2 * MIN_FORCED_CLUSTER_SIZE;
  let largestCluster: number | null = null;
  let largestSize = 0;

  for (const [clusterIdx, size] of sizes.entries()) {
    if (size >= minSizeForSplit && size > largestSize) {
      largestCluster = clusterIdx;
      largestSize = size;
    }
  }

  return largestCluster;
}

/**
 * Split a single cluster into two using k-means
 *
 * @param embeddings - All response embeddings
 * @param clusterIndices - Current cluster assignments
 * @param clusterToSplit - Cluster index to split
 * @returns Updated cluster indices and new cluster sizes
 */
function splitCluster(
  embeddings: number[][],
  clusterIndices: number[],
  clusterToSplit: number
): { updatedIndices: number[]; newSizes: [number, number] } {
  // Extract embeddings for this cluster
  const clusterEmbeddings: number[][] = [];
  const clusterPositions: number[] = [];

  for (let i = 0; i < clusterIndices.length; i++) {
    if (clusterIndices[i] === clusterToSplit) {
      clusterEmbeddings.push(embeddings[i]);
      clusterPositions.push(i);
    }
  }

  // Run k-means with k=2 (deterministic seed)
  const result = kmeans(clusterEmbeddings, 2, {
    initialization: "kmeans++",
    seed: 42,
  });

  // Find highest existing cluster index (excluding MISC_CLUSTER_INDEX)
  let maxClusterIdx = -1;
  for (const idx of clusterIndices) {
    if (idx !== MISC_CLUSTER_INDEX && idx > maxClusterIdx) {
      maxClusterIdx = idx;
    }
  }

  const newClusterIdx = maxClusterIdx + 1;

  // Update cluster assignments
  const updatedIndices = [...clusterIndices];
  const newSizes: [number, number] = [0, 0];

  for (let i = 0; i < clusterPositions.length; i++) {
    const position = clusterPositions[i];
    const subCluster = result.clusters[i];

    if (subCluster === 0) {
      // Keep in original cluster
      newSizes[0]++;
    } else {
      // Move to new cluster
      updatedIndices[position] = newClusterIdx;
      newSizes[1]++;
    }
  }

  return { updatedIndices, newSizes };
}

/**
 * Relabel clusters by size (largest = 0, next = 1, etc.)
 * Excludes MISC_CLUSTER_INDEX from relabeling
 *
 * @param clusterIndices - Original cluster assignments
 * @returns Relabeled cluster indices
 */
function relabelClustersBySize(clusterIndices: number[]): number[] {
  // Count cluster sizes (excluding misc)
  const clusterSizes = new Map<number, number>();
  for (const idx of clusterIndices) {
    if (idx === MISC_CLUSTER_INDEX) continue;
    clusterSizes.set(idx, (clusterSizes.get(idx) || 0) + 1);
  }

  // Sort clusters by size (descending)
  const sortedClusters = Array.from(clusterSizes.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([idx]) => idx);

  // Create mapping from old to new indices
  const relabelMap = new Map<number, number>();
  sortedClusters.forEach((oldIdx, newIdx) => {
    relabelMap.set(oldIdx, newIdx);
  });

  // Apply relabeling (preserve MISC_CLUSTER_INDEX)
  return clusterIndices.map((idx) =>
    idx === MISC_CLUSTER_INDEX
      ? MISC_CLUSTER_INDEX
      : (relabelMap.get(idx) ?? idx)
  );
}

/**
 * Enforce minimum cluster count via post-processing splits
 *
 * This function:
 * 1. Determines target minimum clusters based on response count
 * 2. Computes effective minimum respecting feasibility
 * 3. Iteratively splits largest eligible clusters until floor is met
 * 4. Relabels clusters by size for stable UX
 *
 * @param embeddings - All response embeddings
 * @param clusterIndices - Current cluster assignments (may include MISC_CLUSTER_INDEX)
 * @param responseCount - Total number of responses
 * @returns Enforcement result with updated cluster indices and metadata
 */
export function enforceMinClusters(
  embeddings: number[][],
  clusterIndices: number[],
  responseCount: number
): EnforceMinClustersResult {
  // Determine target and effective minimum clusters
  const targetMinClusters = determineTargetMinClusters(responseCount);
  const effectiveMinClusters = computeEffectiveMinClusters(
    targetMinClusters,
    responseCount
  );

  // Count current non-misc clusters
  let currentClusterCount = countNonMiscClusters(clusterIndices);

  // Early exit if already meeting the floor
  if (currentClusterCount >= effectiveMinClusters) {
    return {
      clusterIndices,
      splitsPerformed: 0,
      targetMinClusters,
      effectiveMinClusters,
      finalClusterCount: currentClusterCount,
      reason: "Already meets minimum cluster floor",
    };
  }

  // Perform forced splits
  let updatedIndices = [...clusterIndices];
  let splitsPerformed = 0;

  while (currentClusterCount < effectiveMinClusters) {
    const clusterToSplit = findLargestEligibleCluster(updatedIndices);

    if (clusterToSplit === null) {
      // No eligible clusters to split
      return {
        clusterIndices: relabelClustersBySize(updatedIndices),
        splitsPerformed,
        targetMinClusters,
        effectiveMinClusters,
        finalClusterCount: currentClusterCount,
        reason:
          "No eligible clusters to split (all below minimum size threshold)",
      };
    }

    // Get cluster size before split
    const sizes = getClusterSizes(updatedIndices);
    const clusterSize = sizes.get(clusterToSplit) || 0;

    // Split the cluster
    const { updatedIndices: newIndices, newSizes } = splitCluster(
      embeddings,
      updatedIndices,
      clusterToSplit
    );

    updatedIndices = newIndices;
    splitsPerformed++;
    currentClusterCount++;

    console.log(
      `[enforceMinClusters] Split cluster ${clusterToSplit} (size ${clusterSize}) → [${newSizes[0]}, ${newSizes[1]}]`
    );
  }

  // Relabel by size for stable UX
  const relabeledIndices = relabelClustersBySize(updatedIndices);

  return {
    clusterIndices: relabeledIndices,
    splitsPerformed,
    targetMinClusters,
    effectiveMinClusters,
    finalClusterCount: currentClusterCount,
  };
}
