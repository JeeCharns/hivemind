/**
 * Outlier Detection for Conversation Analysis
 *
 * Uses MAD-based z-score to detect responses far from cluster centroids.
 * Follows SRP: pure statistical functions, no DB or API dependencies.
 *
 * Algorithm:
 * 1. Compute distance from each response to its assigned cluster centroid
 * 2. For each cluster, compute Median Absolute Deviation (MAD)
 * 3. Compute modified z-scores: z = 0.6745 * (x - median) / MAD
 * 4. Mark responses with z > threshold as outliers
 * 5. Reassign outliers to MISC_CLUSTER_INDEX (-1)
 *
 * Edge cases:
 * - MAD = 0 (all distances identical): treat as no outliers
 * - Cluster size < minClusterSize: skip outlier detection
 * - Outliers > maxOutlierRatio: cap at max percentage
 */

/**
 * Compute median of an array
 *
 * @param values - Array of numbers
 * @returns Median value
 */
export function computeMedian(values: number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty array");
  }

  // Sort a copy to avoid mutating input
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    // Even length: average of two middle values
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    // Odd length: middle value
    return sorted[mid];
  }
}

/**
 * Compute Median Absolute Deviation (MAD)
 *
 * MAD = median(|x_i - median(x)|)
 *
 * @param distances - Array of distance values
 * @returns MAD value
 */
export function computeMAD(distances: number[]): number {
  if (distances.length === 0) {
    throw new Error("Cannot compute MAD of empty array");
  }

  const median = computeMedian(distances);
  const deviations = distances.map((d) => Math.abs(d - median));
  return computeMedian(deviations);
}

/**
 * Compute MAD-based z-score for each distance
 *
 * Uses modified z-score: z = 0.6745 * (x - median) / MAD
 * The 0.6745 factor makes MAD comparable to standard deviation for normal distributions.
 *
 * @param distances - Array of distance values
 * @returns Array of z-scores (same length as distances)
 */
export function computeMADZScores(distances: number[]): number[] {
  if (distances.length === 0) {
    return [];
  }

  const median = computeMedian(distances);
  const mad = computeMAD(distances);

  // If MAD is 0, all distances are identical - no outliers
  if (mad === 0) {
    return distances.map(() => 0);
  }

  // Modified z-score formula
  const SCALE_FACTOR = 0.6745;
  return distances.map((d) => SCALE_FACTOR * Math.abs(d - median) / mad);
}

/**
 * Options for outlier detection
 */
export interface OutlierDetectionOptions {
  /** Z-score threshold above which responses are marked as outliers (default: 3.5) */
  threshold?: number;
  /** Minimum cluster size to apply outlier detection (default: 6) */
  minClusterSize?: number;
  /** Maximum fraction of cluster that can be marked as outliers (default: 0.20 = 20%) */
  maxOutlierRatio?: number;
}

/**
 * Detect outliers using MAD-based z-score threshold
 *
 * @param distances - Distance of each response to its cluster centroid
 * @param options - Outlier detection options
 * @returns Boolean array indicating outliers (same length as distances)
 */
export function detectOutliers(
  distances: number[],
  options: OutlierDetectionOptions = {}
): boolean[] {
  const {
    threshold = 3.5,
    minClusterSize = 6,
    maxOutlierRatio = 0.20,
  } = options;

  // Skip if cluster too small
  if (distances.length < minClusterSize) {
    return distances.map(() => false);
  }

  // Compute z-scores
  const zScores = computeMADZScores(distances);

  // Mark outliers above threshold
  const outlierIndices: number[] = [];
  for (let i = 0; i < zScores.length; i++) {
    if (zScores[i] > threshold) {
      outlierIndices.push(i);
    }
  }

  // Cap at max outlier ratio
  const maxOutliers = Math.floor(distances.length * maxOutlierRatio);
  let finalOutliers: Set<number>;

  if (outlierIndices.length > maxOutliers) {
    // Sort by z-score descending, take top maxOutliers
    const sortedOutliers = outlierIndices
      .map((idx) => ({ idx, zScore: zScores[idx] }))
      .sort((a, b) => b.zScore - a.zScore)
      .slice(0, maxOutliers)
      .map((o) => o.idx);
    finalOutliers = new Set(sortedOutliers);
  } else {
    finalOutliers = new Set(outlierIndices);
  }

  // Return boolean array
  return distances.map((_, i) => finalOutliers.has(i));
}

/**
 * Detect outliers per cluster
 *
 * @param clusterAssignments - Cluster index for each response (0-based)
 * @param distancesToCentroid - Distance to assigned centroid for each response
 * @param options - Outlier detection options
 * @returns Map of cluster index to set of outlier response indices
 */
export function detectOutliersPerCluster(
  clusterAssignments: number[],
  distancesToCentroid: number[],
  options: OutlierDetectionOptions = {}
): Map<number, Set<number>> {
  if (clusterAssignments.length !== distancesToCentroid.length) {
    throw new Error("clusterAssignments and distancesToCentroid must have same length");
  }

  const outlierMap = new Map<number, Set<number>>();

  // Group response indices by cluster
  const clusterGroups = new Map<number, number[]>();
  for (let i = 0; i < clusterAssignments.length; i++) {
    const clusterIdx = clusterAssignments[i];
    if (!clusterGroups.has(clusterIdx)) {
      clusterGroups.set(clusterIdx, []);
    }
    clusterGroups.get(clusterIdx)!.push(i);
  }

  // Detect outliers for each cluster
  for (const [clusterIdx, responseIndices] of clusterGroups.entries()) {
    // Get distances for this cluster
    const clusterDistances = responseIndices.map((i) => distancesToCentroid[i]);

    // Detect outliers
    const isOutlier = detectOutliers(clusterDistances, options);

    // Map back to global indices
    const outliers = new Set<number>();
    for (let j = 0; j < responseIndices.length; j++) {
      if (isOutlier[j]) {
        outliers.add(responseIndices[j]);
      }
    }

    if (outliers.size > 0) {
      outlierMap.set(clusterIdx, outliers);
    }
  }

  return outlierMap;
}
