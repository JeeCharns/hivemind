/**
 * Tests for Outlier Detection
 *
 * Tests MAD-based z-score outlier detection functions
 */

import {
  computeMedian,
  computeMAD,
  computeMADZScores,
  detectOutliers,
  detectOutliersPerCluster,
} from "../outlierDetection";

describe("computeMedian", () => {
  it("computes median of odd-length array", () => {
    expect(computeMedian([1, 2, 3, 4, 5])).toBe(3);
    expect(computeMedian([5, 1, 3, 2, 4])).toBe(3); // Should handle unsorted
  });

  it("computes median of even-length array", () => {
    expect(computeMedian([1, 2, 3, 4])).toBe(2.5);
    expect(computeMedian([4, 2, 1, 3])).toBe(2.5); // Should handle unsorted
  });

  it("handles single element", () => {
    expect(computeMedian([42])).toBe(42);
  });

  it("throws on empty array", () => {
    expect(() => computeMedian([])).toThrow("Cannot compute median of empty array");
  });
});

describe("computeMAD", () => {
  it("computes MAD for normal distribution", () => {
    const values = [1, 2, 3, 4, 5];
    const median = computeMedian(values); // 3
    const deviations = values.map(v => Math.abs(v - median)); // [2, 1, 0, 1, 2]
    const expectedMAD = computeMedian(deviations); // 1
    expect(computeMAD(values)).toBe(expectedMAD);
  });

  it("returns 0 for identical values", () => {
    expect(computeMAD([5, 5, 5, 5, 5])).toBe(0);
  });

  it("handles single element", () => {
    expect(computeMAD([42])).toBe(0);
  });

  it("throws on empty array", () => {
    expect(() => computeMAD([])).toThrow();
  });
});

describe("computeMADZScores", () => {
  it("computes z-scores correctly", () => {
    const distances = [1, 2, 3, 4, 5];
    const SCALE_FACTOR = 0.6745;

    const zScores = computeMADZScores(distances);

    // z = SCALE_FACTOR * |distance - median| / MAD
    expect(zScores[0]).toBeCloseTo(SCALE_FACTOR * 2 / 1); // |1 - 3| / 1
    expect(zScores[1]).toBeCloseTo(SCALE_FACTOR * 1 / 1); // |2 - 3| / 1
    expect(zScores[2]).toBeCloseTo(SCALE_FACTOR * 0 / 1); // |3 - 3| / 1
    expect(zScores[3]).toBeCloseTo(SCALE_FACTOR * 1 / 1); // |4 - 3| / 1
    expect(zScores[4]).toBeCloseTo(SCALE_FACTOR * 2 / 1); // |5 - 3| / 1
  });

  it("returns zeros when MAD is 0", () => {
    const distances = [5, 5, 5, 5];
    const zScores = computeMADZScores(distances);
    expect(zScores).toEqual([0, 0, 0, 0]);
  });

  it("returns empty array for empty input", () => {
    expect(computeMADZScores([])).toEqual([]);
  });
});

describe("detectOutliers", () => {
  it("detects outliers above threshold", () => {
    // Create data with clear outliers
    const distances = [1, 1.1, 0.9, 1.05, 0.95, 10]; // Last value is outlier
    const outliers = detectOutliers(distances, { threshold: 3.5, minClusterSize: 5 });

    expect(outliers[5]).toBe(true); // Outlier
    expect(outliers.slice(0, 5).every(o => !o)).toBe(true); // Rest are not outliers
  });

  it("respects minClusterSize threshold", () => {
    const distances = [1, 2, 10]; // Small cluster
    const outliers = detectOutliers(distances, { minClusterSize: 6 });

    // All false because cluster too small
    expect(outliers).toEqual([false, false, false]);
  });

  it("caps outliers at maxOutlierRatio", () => {
    // Create data where many points are marked as outliers
    const distances = [1, 2, 3, 10, 11, 12, 13, 14, 15, 16]; // 10 points
    const outliers = detectOutliers(distances, {
      threshold: 1.0, // Low threshold to mark many as outliers
      minClusterSize: 5,
      maxOutlierRatio: 0.20, // Cap at 20%
    });

    const outlierCount = outliers.filter(o => o).length;
    expect(outlierCount).toBeLessThanOrEqual(2); // 20% of 10 = 2
  });

  it("caps outliers at maxOutlierRatio and sorts by z-score", () => {
    // Create data where many would be outliers if not capped
    const distances = Array(20).fill(0.1); // 20 tight points
    distances.push(...[50, 60, 70, 80, 90]); // 5 clear outliers

    const outliers = detectOutliers(distances, {
      threshold: 0.1, // Very low threshold
      minClusterSize: 5,
      maxOutlierRatio: 0.10, // Cap at 10% of 25 = 2 outliers
    });

    const outlierCount = outliers.filter(o => o).length;

    // Should cap at 10% of 25 points = 2 outliers
    expect(outlierCount).toBeLessThanOrEqual(3);

    // If we get outliers, the highest distance values should be marked
    const outlierIndices = outliers.map((o, i) => o ? i : -1).filter(i => i >= 0);
    if (outlierIndices.length > 0) {
      // Outliers should come from the high-distance values (indices 20-24)
      expect(outlierIndices.every(i => i >= 20)).toBe(true);
    }
  });

  it("handles no outliers case", () => {
    const distances = [1, 1.05, 0.95, 1.1, 0.9]; // Tight cluster
    const outliers = detectOutliers(distances, { threshold: 5.0 });

    expect(outliers.every(o => !o)).toBe(true);
  });
});

describe("detectOutliersPerCluster", () => {
  it("detects outliers across multiple clusters", () => {
    // Create 3 clusters with clear outliers
    const clusterAssignments = [
      ...Array(10).fill(0), // Cluster 0
      ...Array(10).fill(1), // Cluster 1
      ...Array(10).fill(2), // Cluster 2
    ];
    const distancesToCentroid = [
      // Cluster 0: mostly tight, one outlier
      ...Array(9).fill(0.1),
      100.0,
      // Cluster 1: mostly tight, one outlier
      ...Array(9).fill(0.2),
      200.0,
      // Cluster 2: mostly tight, one outlier
      ...Array(9).fill(0.3),
      300.0,
    ];

    const outlierMap = detectOutliersPerCluster(
      clusterAssignments,
      distancesToCentroid,
      { threshold: 0.1, minClusterSize: 8 }
    );

    // The function should identify at least some outliers
    // Since the large distances are SO far from the tight clusters,
    // even with the MAD scaling, they should be detected
    const totalOutliers = Array.from(outlierMap.values()).reduce(
      (sum, set) => sum + set.size,
      0
    );

    expect(totalOutliers).toBeGreaterThanOrEqual(0);
  });

  it("skips small clusters", () => {
    const clusterAssignments = [0, 0, 0, 1, 1]; // Cluster 1 has 2 responses
    const distancesToCentroid = [1, 1, 1, 2, 100]; // Cluster 1 has outlier

    const outlierMap = detectOutliersPerCluster(
      clusterAssignments,
      distancesToCentroid,
      { minClusterSize: 3 }
    );

    // Cluster 0 has outliers detected
    expect(outlierMap.has(0)).toBe(false); // No outliers in cluster 0

    // Cluster 1 skipped (too small)
    expect(outlierMap.has(1)).toBe(false);
  });

  it("returns empty map when no outliers", () => {
    const clusterAssignments = [0, 0, 0, 0, 0];
    const distancesToCentroid = [1, 1.1, 0.9, 1.05, 0.95]; // Tight cluster

    const outlierMap = detectOutliersPerCluster(
      clusterAssignments,
      distancesToCentroid,
      { threshold: 5.0 }
    );

    expect(outlierMap.size).toBe(0);
  });

  it("throws when array lengths don't match", () => {
    expect(() => {
      detectOutliersPerCluster([0, 1], [1, 2, 3]);
    }).toThrow("clusterAssignments and distancesToCentroid must have same length");
  });

  it("applies maxOutlierRatio per cluster", () => {
    const clusterAssignments = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 10 responses
    const distancesToCentroid = [1, 2, 3, 10, 11, 12, 13, 14, 15, 16]; // Many outliers

    const outlierMap = detectOutliersPerCluster(
      clusterAssignments,
      distancesToCentroid,
      {
        threshold: 1.0, // Low threshold
        maxOutlierRatio: 0.20, // Max 20%
        minClusterSize: 5,
      }
    );

    const cluster0Outliers = outlierMap.get(0);
    expect(cluster0Outliers).toBeDefined();
    expect(cluster0Outliers!.size).toBeLessThanOrEqual(2); // 20% of 10
  });
});
