/**
 * Cluster Hull Generation
 *
 * Creates smooth, organic SVG paths that wrap around cluster points
 * using convex hull + padding + Bézier smoothing
 */

interface Point {
  x: number;
  y: number;
}

/**
 * Cross product of vectors OA and OB
 * Positive = counter-clockwise turn, Negative = clockwise turn
 */
function crossProduct(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Graham Scan algorithm to compute convex hull
 * Returns points in counter-clockwise order
 */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;

  // Sort points by x-coordinate (and y if x is same)
  const sorted = [...points].sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  // Build lower hull
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

/**
 * Offset a polygon outward by a given distance (padding)
 * Uses simple perpendicular offset for each edge
 */
export function offsetPolygon(points: Point[], offset: number): Point[] {
  if (points.length < 3) return points;

  const offsetPoints: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    // Edge vectors
    const edge1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const edge2 = { x: next.x - curr.x, y: next.y - curr.y };

    // Normalize edge vectors
    const len1 = Math.sqrt(edge1.x * edge1.x + edge1.y * edge1.y);
    const len2 = Math.sqrt(edge2.x * edge2.x + edge2.y * edge2.y);
    edge1.x /= len1;
    edge1.y /= len1;
    edge2.x /= len2;
    edge2.y /= len2;

    // Perpendicular vectors (outward normals for counter-clockwise polygon)
    // For CCW polygon: outward normal is 90° clockwise rotation of edge vector
    const normal1 = { x: edge1.y, y: -edge1.x };
    const normal2 = { x: edge2.y, y: -edge2.x };

    // Average normal at this vertex
    const avgNormal = {
      x: (normal1.x + normal2.x) / 2,
      y: (normal1.y + normal2.y) / 2,
    };

    // Normalize average normal
    const avgLen = Math.sqrt(avgNormal.x * avgNormal.x + avgNormal.y * avgNormal.y);
    avgNormal.x /= avgLen;
    avgNormal.y /= avgLen;

    // Calculate offset factor to maintain consistent offset distance
    // This accounts for the angle between edges
    const sinHalfAngle = Math.sqrt((1 - (edge1.x * edge2.x + edge1.y * edge2.y)) / 2);
    const offsetFactor = sinHalfAngle > 0.1 ? 1 / sinHalfAngle : 10; // Clamp to avoid extreme values

    // Apply offset
    offsetPoints.push({
      x: curr.x + avgNormal.x * offset * Math.min(offsetFactor, 3),
      y: curr.y + avgNormal.y * offset * Math.min(offsetFactor, 3),
    });
  }

  return offsetPoints;
}

/**
 * Filter out visual outliers from a cluster's 2D points
 *
 * Removes points that are far from the cluster's 2D centroid using IQR-based
 * distance thresholding. This prevents long "spikey tails" in hull visualization
 * while keeping all points rendered individually.
 *
 * Algorithm:
 * 1. Calculate 2D centroid of all points
 * 2. Compute Euclidean distance from each point to centroid
 * 3. Calculate IQR (Interquartile Range) of distances
 * 4. Filter points beyond Q3 + threshold * IQR
 * 5. Ensure at least 50% of points remain (avoid over-filtering)
 *
 * @param points - Array of 2D points in the cluster
 * @param threshold - IQR multiplier for outlier detection (default: 2.5)
 * @returns Filtered points with visual outliers removed
 */
export function filterVisualOutliers(
  points: Point[],
  threshold = 2.5
): Point[] {
  // Need at least 4 points to meaningfully detect outliers
  if (points.length < 4) return points;

  // Calculate 2D centroid
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

  // Calculate Euclidean distances from each point to centroid
  const distances = points.map((p) =>
    Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)
  );

  // Calculate quartiles for IQR method (robust to outliers)
  const sorted = [...distances].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;

  // Distance threshold: Q3 + threshold * IQR
  const maxDistance = q3 + threshold * iqr;

  // Filter points within threshold
  const filtered = points.filter((_, i) => distances[i] <= maxDistance);

  // Safety check: ensure we don't filter too aggressively
  // Always keep at least 50% of points to avoid collapsing the cluster
  const minPointsToKeep = Math.ceil(points.length * 0.5);
  if (filtered.length < minPointsToKeep) {
    // If filtering is too aggressive, fall back to percentile approach
    // Keep the closest 50% of points by distance
    const indexedDistances = distances.map((d, i) => ({ d, i }));
    indexedDistances.sort((a, b) => a.d - b.d);
    const keepIndices = new Set(
      indexedDistances.slice(0, minPointsToKeep).map((item) => item.i)
    );
    return points.filter((_, i) => keepIndices.has(i));
  }

  return filtered;
}

/**
 * Smooth polygon corners using quadratic Bézier curves
 * Smoothness: 0 = no smoothing, 1 = maximum smoothing
 */
export function smoothPolygon(points: Point[], smoothness = 0.3): string {
  if (points.length < 3) {
    // Fallback for degenerate cases
    return points.length === 0 ? '' : `M ${points[0].x},${points[0].y}`;
  }

  const pathParts: string[] = [];

  // Start at the first point
  pathParts.push(`M ${points[0].x},${points[0].y}`);

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const nextNext = points[(i + 2) % points.length];

    // Calculate control points for smooth curve
    const controlX = next.x;
    const controlY = next.y;

    // Shorten the line segments to create smooth corners
    const dx = next.x - curr.x;
    const dy = next.y - curr.y;

    const dxNext = nextNext.x - next.x;
    const dyNext = nextNext.y - next.y;

    // Start and end points for this curve segment (shortened by smoothness factor)
    const startX = curr.x + dx * (1 - smoothness * 0.5);
    const startY = curr.y + dy * (1 - smoothness * 0.5);

    const endX = next.x + dxNext * smoothness * 0.5;
    const endY = next.y + dyNext * smoothness * 0.5;

    if (i === 0) {
      // Move to adjusted start point
      pathParts[0] = `M ${startX},${startY}`;
    }

    // Quadratic curve through the corner
    pathParts.push(`Q ${controlX},${controlY} ${endX},${endY}`);

    // If this is the last segment, close the path
    if (i === points.length - 1) {
      // Connect back to the beginning with a curve
      const firstControl = points[0];
      const firstEnd = points[0].x + (points[1].x - points[0].x) * smoothness * 0.5;
      const firstEndY = points[0].y + (points[1].y - points[0].y) * smoothness * 0.5;
      pathParts.push(`Q ${firstControl.x},${firstControl.y} ${firstEnd},${firstEndY}`);
    }
  }

  pathParts.push('Z'); // Close path

  return pathParts.join(' ');
}

/**
 * Generate smooth hull path for a cluster of points
 *
 * @param points - Array of 2D points in the cluster
 * @param padding - Outward padding distance from convex hull (default: 18)
 * @param smoothness - Bézier curve smoothness factor 0-1 (default: 0.3)
 * @param filterOutliers - Whether to filter visual outliers before hull generation (default: true)
 * @param outlierThreshold - IQR multiplier for outlier filtering (default: 2.5)
 * @returns SVG path string for the cluster hull
 */
export function generateClusterHullPath(
  points: Point[],
  padding = 18,
  smoothness = 0.3,
  filterOutliers = true,
  outlierThreshold = 2.5
): string {
  if (points.length === 0) return '';

  // Fallback to circle for very small clusters
  if (points.length === 1) {
    const p = points[0];
    const r = padding;
    return `M ${p.x - r},${p.y} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;
  }

  if (points.length === 2) {
    // For 2 points, create a capsule shape
    const [p1, p2] = points;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = (-dy / len) * padding;
    const ny = (dx / len) * padding;

    return `M ${p1.x + nx},${p1.y + ny}
            L ${p2.x + nx},${p2.y + ny}
            A ${padding},${padding} 0 0,1 ${p2.x - nx},${p2.y - ny}
            L ${p1.x - nx},${p1.y - ny}
            A ${padding},${padding} 0 0,1 ${p1.x + nx},${p1.y + ny} Z`;
  }

  // For 3+ points, filter visual outliers before generating hull
  // This prevents long "spikey tails" from isolated points far from the main cluster
  const filteredPoints = filterOutliers
    ? filterVisualOutliers(points, outlierThreshold)
    : points;

  // Generate convex hull from filtered points
  const hull = convexHull(filteredPoints);
  const paddedHull = offsetPolygon(hull, padding);
  const smoothPath = smoothPolygon(paddedHull, smoothness);

  return smoothPath;
}
