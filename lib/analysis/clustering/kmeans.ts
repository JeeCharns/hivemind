/**
 * K-Means Clustering
 *
 * Groups similar embeddings into clusters
 * Follows SRP: single responsibility of clustering
 */

import kmeans from "ml-kmeans";

/**
 * Configuration for optimal cluster determination
 */
export interface ClusteringConfig {
  /**
   * Minimum meaningful cluster size (used to derive max k)
   * Default: 8 responses per cluster minimum
   */
  minClusterSize?: number;
  /**
   * Maximum k to evaluate (search budget)
   * If not specified, derived from data size
   */
  maxClusters?: number;
  /**
   * Enable debug logging (defaults to ANALYSIS_DEBUG_CLUSTERING env var)
   */
  debug?: boolean;
}

function parsePositiveIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const intValue = Math.floor(value);
  if (intValue <= 0) return null;
  return intValue;
}

function defaultMinClusterSizeForN(n: number): number {
  if (n >= 400) return 20;
  if (n >= 200) return 16;
  if (n >= 100) return 12;
  return 8;
}

/**
 * Compute perpendicular distance from point to line
 * Used for knee detection in the distortion curve
 */
function perpendicularDistance(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const denominator = Math.sqrt(dx * dx + dy * dy);

  if (denominator === 0) return 0;

  const numerator = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1);
  return numerator / denominator;
}

/**
 * Determine optimal number of clusters using knee detection
 *
 * Uses the "maximum distance to baseline line" method:
 * - Computes distortions for k = 1..maxK
 * - Draws a straight line from (k=1, d1) to (k=maxK, dMax)
 * - Chooses k with maximum perpendicular distance to that line
 *
 * This approach is data-driven and avoids hard-coded floors/caps.
 *
 * @param embeddings - Array of embedding vectors
 * @param config - Configuration for clustering
 * @returns Optimal number of clusters (may be 1 for homogeneous data)
 */
function determineOptimalClusters(
  embeddings: number[][],
  config: ClusteringConfig = {}
): number {
  const n = embeddings.length;
  const minClusterSize =
    config.minClusterSize ??
    parsePositiveIntEnv("ANALYSIS_MIN_CLUSTER_SIZE") ??
    defaultMinClusterSizeForN(n);
  const debug = config.debug ?? process.env.ANALYSIS_DEBUG_CLUSTERING === "1";

  // Handle trivial cases
  if (n === 0) return 0;
  if (n === 1) return 1;

  // Derive adaptive max k from data size
  // Constraint 1: At least minClusterSize per cluster
  // Constraint 2: Safety bound of n/3 (avoid tiny clusters)
  const derivedMaxK = Math.min(
    Math.floor(n / minClusterSize),
    Math.floor(n / 3)
  );

  // Allow manual override but cap at derived max
  const envMaxClusters = parsePositiveIntEnv("ANALYSIS_MAX_CLUSTERS");
  const maxK = Math.min(
    derivedMaxK,
    config.maxClusters ?? Number.POSITIVE_INFINITY,
    envMaxClusters ?? Number.POSITIVE_INFINITY
  );

  // Must evaluate at least k=1
  if (maxK < 1) return 1;

  // Compute distortions for k = 1..maxK
  // Distortion = sum of squared distances from each point to its cluster centroid
  const distortions: number[] = [];
  for (let k = 1; k <= maxK; k++) {
    const result = kmeans(embeddings, k, {
      initialization: "kmeans++",
      seed: 42, // Deterministic for stable k-selection
    });

    // Manually compute distortion as sum of squared distances to centroids
    // result.centroids is an array of objects: [{centroid: [...], error: ..., size: ...}, ...]
    let distortion = 0;
    for (let i = 0; i < embeddings.length; i++) {
      const clusterIdx = result.clusters[i];
      const centroidObj = result.centroids[clusterIdx];

      if (!centroidObj || !centroidObj.centroid) {
        continue;
      }

      const centroid = centroidObj.centroid;
      let squaredDist = 0;
      for (let j = 0; j < embeddings[i].length; j++) {
        const diff = embeddings[i][j] - centroid[j];
        squaredDist += diff * diff;
      }
      distortion += squaredDist;
    }
    distortions.push(distortion);
  }

  if (debug) {
    console.log(
      `[determineOptimalClusters] n=${n}, minClusterSize=${minClusterSize}, evaluated k=1..${maxK}`
    );
    console.log(`[determineOptimalClusters] distortions:`, distortions);
  }

  // Early exit: if d1 is near-zero, embeddings are identical or near-identical
  const ZERO_TOLERANCE = 1e-10;
  if (distortions[0] < ZERO_TOLERANCE) {
    if (debug) {
      console.log(
        `[determineOptimalClusters] distortion[k=1] ~= 0, returning k=1 (homogeneous data)`
      );
    }
    return 1;
  }

  // If we only evaluated k=1, return it
  if (distortions.length === 1) {
    return 1;
  }

  // Knee detection: find k with maximum perpendicular distance to baseline line
  // Baseline line: from (k=1, d[0]) to (k=maxK, d[maxK-1])
  const x1 = 1;
  const y1 = distortions[0];
  const x2 = maxK;
  const y2 = distortions[maxK - 1];

  let bestK = 1;
  let maxDistance = 0;

  for (let k = 1; k <= maxK; k++) {
    const distance = perpendicularDistance(
      k,
      distortions[k - 1],
      x1,
      y1,
      x2,
      y2
    );
    if (distance > maxDistance) {
      maxDistance = distance;
      bestK = k;
    }
  }

  // Check if curve is effectively linear (no meaningful knee)
  // However, if there's a steep drop from k=1 to k=2, that's a strong signal
  // even if the overall curve looks linear (because the rest of the curve after k=2 might be flat)
  const yRange = Math.abs(y1 - y2);
  const dropK1ToK2 =
    distortions.length >= 2 ? Math.abs(distortions[0] - distortions[1]) : 0;
  const isStrongK2Signal = dropK1ToK2 > 0.5 * distortions[0]; // 50%+ drop from k=1 to k=2

  // Only apply linear threshold if there's no strong k=2 signal
  const LINEAR_THRESHOLD = 0.001; // 0.1% of y-range (very conservative)
  if (
    !isStrongK2Signal &&
    yRange > 0 &&
    maxDistance < LINEAR_THRESHOLD * yRange
  ) {
    if (debug) {
      console.log(
        `[determineOptimalClusters] curve is linear (maxDistance=${maxDistance}, yRange=${yRange}), returning k=1`
      );
    }
    return 1;
  }

  if (debug) {
    console.log(
      `[determineOptimalClusters] chose k=${bestK} (maxDistance=${maxDistance})`
    );
  }

  return bestK;
}

/**
 * Cluster embeddings using K-Means
 *
 * @param embeddings - Array of embedding vectors
 * @param numClusters - Optional: number of clusters (auto-determined if not provided)
 * @param config - Optional: configuration for cluster determination
 * @returns Array of cluster indices
 */
export function clusterEmbeddings(
  embeddings: number[][],
  numClusters?: number,
  config: ClusteringConfig = {}
): number[] {
  if (embeddings.length === 0) {
    return [];
  }

  // Single item
  if (embeddings.length === 1) {
    return [0];
  }

  const debug = config.debug ?? process.env.ANALYSIS_DEBUG_CLUSTERING === "1";

  try {
    const k = numClusters ?? determineOptimalClusters(embeddings, config);

    if (debug) {
      console.log(
        `[clusterEmbeddings] Using k=${k} for ${embeddings.length} embeddings`
      );
    }

    // Handle k=1 case (all in one cluster)
    if (k === 1) {
      return new Array(embeddings.length).fill(0);
    }

    const result = kmeans(embeddings, k, {
      initialization: "kmeans++",
      seed: 42, // Deterministic for testing
    });

    if (debug) {
      const clusterSizes = new Map<number, number>();
      for (const idx of result.clusters) {
        clusterSizes.set(idx, (clusterSizes.get(idx) || 0) + 1);
      }
      console.log(
        `[clusterEmbeddings] Cluster sizes:`,
        Array.from(clusterSizes.entries()).sort((a, b) => b[1] - a[1])
      );
    }

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
export function getClusterStats(clusterIndices: number[]): Map<number, number> {
  const stats = new Map<number, number>();

  for (const idx of clusterIndices) {
    stats.set(idx, (stats.get(idx) || 0) + 1);
  }

  return stats;
}
