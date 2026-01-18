/**
 * buildClusterSummaries - Cluster Summary Builder
 *
 * Builds cluster summaries for the "All themes" view in UnderstandView
 * Each summary includes:
 * - Theme title and metadata
 * - Most representative response (nearest to centroid in UMAP space)
 * - Response count for the cluster
 * - Filter value to apply when "Show X responses" is clicked
 *
 * Follows SRP: pure function for summary derivation, no UI concerns
 */

import type {
  ResponsePoint,
  ThemeRow,
  FeedbackItem,
  ClusterBucket,
} from "@/types/conversation-understand";
import { MISC_CLUSTER_INDEX } from "./thresholds";

export interface ClusterSummary {
  key: string;
  title: string;
  /** Concise description summarizing the cluster's consolidated statements */
  description: string | null;
  /** Individual bucket names for rendering as pills */
  bucketNames: string[];
  representativeText: string;
  representativeItem: FeedbackItem | null;
  responseCount: number;
  filterValue: "unclustered" | number;
  clusterIndex: number | null;
}

/**
 * Computes the Euclidean distance between two 2D points
 */
const distance = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
};

/**
 * Finds the most representative response for a cluster
 * Strategy:
 * 1. Compute centroid of all points with UMAP coords in the cluster
 * 2. Find the response closest to the centroid
 * 3. Fallback to first response if no UMAP coords exist
 */
const findRepresentative = (
  clusterResponses: ResponsePoint[],
  feedbackById: Map<string, FeedbackItem>
): { text: string; item: FeedbackItem | null } => {
  // Filter to points with valid UMAP coordinates
  const validPoints = clusterResponses.filter(
    (r) => r.xUmap !== null && r.yUmap !== null
  );

  let representative: ResponsePoint;

  if (validPoints.length === 0) {
    // Fallback: use first response
    representative = clusterResponses[0];
  } else {
    // Compute centroid
    const cx =
      validPoints.reduce((sum, p) => sum + p.xUmap!, 0) / validPoints.length;
    const cy =
      validPoints.reduce((sum, p) => sum + p.yUmap!, 0) / validPoints.length;

    // Find closest point to centroid
    let minDist = Infinity;
    let closest = validPoints[0];

    for (const point of validPoints) {
      const dist = distance(point.xUmap!, point.yUmap!, cx, cy);
      if (dist < minDist) {
        minDist = dist;
        closest = point;
      }
    }

    representative = closest;
  }

  return {
    text: representative.responseText,
    item: feedbackById.get(representative.id) || null,
  };
};

/**
 * Gets bucket names for a cluster and generates a description
 * Returns both the individual bucket names array and a joined description string
 */
const getClusterBucketInfo = (
  clusterIndex: number,
  clusterBuckets: ClusterBucket[],
  themeDescription: string | null
): { bucketNames: string[]; description: string | null } => {
  // Get buckets for this cluster
  const bucketsForCluster = clusterBuckets.filter(
    (b) => b.clusterIndex === clusterIndex
  );

  if (bucketsForCluster.length === 0) {
    // Fallback to theme description if no buckets
    return { bucketNames: [], description: themeDescription };
  }

  // Extract bucket names
  const bucketNames = bucketsForCluster.map((b) => b.bucketName);
  return { bucketNames, description: bucketNames.join(", ") };
};

/**
 * Builds cluster summaries for the "All themes" view
 *
 * @param responses - All response points from the view model
 * @param themes - Theme metadata from analysis
 * @param feedbackItems - Feedback items for vote counts/current state
 * @param clusterBuckets - Optional cluster buckets for generating descriptions
 * @returns Array of cluster summaries, sorted with MISC last, plus unclustered if present
 */
export function buildClusterSummaries(
  responses: ResponsePoint[],
  themes: ThemeRow[],
  feedbackItems: FeedbackItem[],
  clusterBuckets?: ClusterBucket[]
): ClusterSummary[] {
  const feedbackById = new Map(feedbackItems.map((item) => [item.id, item]));
  const buckets = clusterBuckets || [];

  // Group responses by cluster index
  const byCluster = new Map<number, ResponsePoint[]>();
  const unclusteredResponses: ResponsePoint[] = [];

  for (const response of responses) {
    if (response.clusterIndex === null) {
      unclusteredResponses.push(response);
    } else {
      const existing = byCluster.get(response.clusterIndex) || [];
      existing.push(response);
      byCluster.set(response.clusterIndex, existing);
    }
  }

  const summaries: ClusterSummary[] = [];

  // Build summaries for each theme cluster
  for (const theme of themes) {
    const clusterResponses = byCluster.get(theme.clusterIndex);
    if (!clusterResponses || clusterResponses.length === 0) continue;

    const { text, item } = findRepresentative(clusterResponses, feedbackById);
    const { bucketNames, description } = getClusterBucketInfo(
      theme.clusterIndex,
      buckets,
      theme.description
    );

    summaries.push({
      key: `cluster-${theme.clusterIndex}`,
      title: theme.name || `Theme ${theme.clusterIndex}`,
      description,
      bucketNames,
      representativeText: text,
      representativeItem: item,
      responseCount: clusterResponses.length,
      filterValue: theme.clusterIndex,
      clusterIndex: theme.clusterIndex,
    });
  }

  // Sort: regular clusters first (by index), MISC last
  summaries.sort((a, b) => {
    if (a.clusterIndex === MISC_CLUSTER_INDEX) return 1;
    if (b.clusterIndex === MISC_CLUSTER_INDEX) return -1;
    return a.clusterIndex! - b.clusterIndex!;
  });

  // Add unclustered/new responses summary if present
  if (unclusteredResponses.length > 0) {
    const { text, item } = findRepresentative(
      unclusteredResponses,
      feedbackById
    );

    summaries.push({
      key: "unclustered",
      title: "Unclustered/New responses",
      description: null,
      bucketNames: [],
      representativeText: text,
      representativeItem: item,
      responseCount: unclusteredResponses.length,
      filterValue: "unclustered",
      clusterIndex: null,
    });
  }

  return summaries;
}
