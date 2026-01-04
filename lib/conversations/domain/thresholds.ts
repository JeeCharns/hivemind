/**
 * Conversation Analysis Thresholds - Domain Constants
 *
 * Single source of truth for all analysis and report thresholds
 * Prevents drift across routes, services, and UI components
 * Follows SRP: pure constants, no logic
 */

/**
 * Minimum responses required to trigger automatic analysis
 * Used across:
 * - Understand tab gating
 * - Analysis trigger logic
 * - UI threshold displays
 */
export const UNDERSTAND_MIN_RESPONSES = 20;

/**
 * Minimum responses required to generate a report
 * Aligned with UNDERSTAND_MIN_RESPONSES to ensure consistency
 * Used across:
 * - Report tab gating
 * - Report generation API
 * - UI threshold displays
 */
export const REPORT_MIN_RESPONSES = UNDERSTAND_MIN_RESPONSES;

/**
 * Threshold for choosing incremental vs full analysis strategy
 * When new responses < INCREMENTAL_THRESHOLD, use incremental analysis
 * When new responses >= INCREMENTAL_THRESHOLD, use full re-analysis
 */
export const INCREMENTAL_THRESHOLD = 10;

/**
 * Special cluster index for miscellaneous/outlier responses
 * Value: -1 (distinct from regular clusters 0..N-1 and null for unanalyzed)
 * Used by outlier detection to mark responses far from their cluster centroids
 */
export const MISC_CLUSTER_INDEX = -1;

/**
 * MAD-based z-score threshold for outlier detection
 * Responses with modified z-score > threshold are marked as outliers
 * Modified z-score: z = 0.6745 * |distance - median| / MAD
 */
export const OUTLIER_Z_THRESHOLD = 3.5;

/**
 * Minimum cluster size for outlier detection
 * Clusters smaller than this skip outlier detection
 * Prevents unstable statistics from small samples
 */
export const OUTLIER_MIN_CLUSTER_SIZE = 6;

/**
 * Maximum outlier ratio per cluster
 * Cap outliers at this percentage to prevent entire cluster being marked as misc
 * Example: 0.20 = at most 20% of cluster can be outliers
 */
export const OUTLIER_MAX_RATIO = 0.20;

/**
 * Minimum cluster count for small datasets (n <= 40)
 * Applied via post-processing splits in full analysis only
 */
export const MIN_CLUSTERS_SMALL = 3;

/**
 * Minimum cluster count for large datasets (n >= 41)
 * Applied via post-processing splits in full analysis only
 */
export const MIN_CLUSTERS_LARGE = 5;

/**
 * Minimum cluster size required to split during forced cluster enforcement
 * Must be >= 2 * this value to be eligible for splitting
 * Recommended: 2 for strict floor enforcement, 3 for stability
 */
export const MIN_FORCED_CLUSTER_SIZE = 2;
