/**
 * Similarity Grouping for "Frequently Mentioned" Detection
 *
 * Groups near-duplicate responses within a theme using cosine similarity
 * on embeddings. Uses connected components for transitive paraphrases.
 *
 * Algorithm:
 * 1. For responses in a theme, build adjacency graph where edge exists if sim(i,j) >= threshold
 * 2. Compute connected components (transitive closure)
 * 3. Each component of size >= min_group_size becomes a "frequently mentioned group"
 * 4. Pick representative as response closest to group centroid (medoid-like)
 *
 * Follows SRP: pure grouping logic, no DB or API dependencies
 */

export interface ResponseWithEmbedding {
  id: string;
  text: string;
  embedding: number[];
  clusterIndex: number | null;
}

export interface ResponseGroup {
  clusterIndex: number;
  representativeId: string;
  memberIds: string[];
  size: number;
}

export interface GroupingParams {
  simThreshold: number; // Default: 0.85 (tune empirically)
  minGroupSize: number; // Default: 2
  algorithmVersion: string; // For observability: "v1.1"
}

export const DEFAULT_GROUPING_PARAMS: GroupingParams = {
  simThreshold: 0.8,
  minGroupSize: 2, // Lowered from 3 to allow pairs of similar responses
  algorithmVersion: "v1.1",
};

/**
 * Group responses by similarity within each theme
 *
 * @param responses - All responses with embeddings and cluster assignments
 * @param params - Grouping parameters (threshold, min size)
 * @returns Array of response groups (one per frequently mentioned cluster)
 */
export function groupResponsesBySimilarity(
  responses: ResponseWithEmbedding[],
  params: GroupingParams = DEFAULT_GROUPING_PARAMS
): ResponseGroup[] {
  // Group responses by theme (cluster_index)
  const responsesByTheme = new Map<number, ResponseWithEmbedding[]>();
  for (const response of responses) {
    if (response.clusterIndex === null) continue;

    if (!responsesByTheme.has(response.clusterIndex)) {
      responsesByTheme.set(response.clusterIndex, []);
    }
    responsesByTheme.get(response.clusterIndex)!.push(response);
  }

  // Process each theme independently
  const allGroups: ResponseGroup[] = [];
  for (const [clusterIndex, themeResponses] of responsesByTheme.entries()) {
    const themeGroups = groupResponsesInTheme(
      clusterIndex,
      themeResponses,
      params
    );
    allGroups.push(...themeGroups);
  }

  return allGroups;
}

/**
 * Group responses within a single theme
 *
 * @param clusterIndex - Theme cluster index
 * @param responses - Responses in this theme
 * @param params - Grouping parameters
 * @returns Groups for this theme
 */
function groupResponsesInTheme(
  clusterIndex: number,
  responses: ResponseWithEmbedding[],
  params: GroupingParams
): ResponseGroup[] {
  if (responses.length < params.minGroupSize) {
    // Theme too small to have groups
    return [];
  }

  // 1. Build adjacency graph using cosine similarity
  const adjacency = buildSimilarityGraph(responses, params.simThreshold);

  // 2. Find connected components
  const components = findConnectedComponents(adjacency, responses.length);

  // 3. Filter components by size and pick representatives
  const groups: ResponseGroup[] = [];
  for (const component of components) {
    if (component.length < params.minGroupSize) {
      continue; // Too small to be a "frequently mentioned" group
    }

    // Pick representative (closest to centroid)
    const memberResponses = component.map((idx) => responses[idx]);
    const representativeIdx = selectRepresentative(memberResponses);
    const representative = memberResponses[representativeIdx];

    groups.push({
      clusterIndex,
      representativeId: representative.id,
      memberIds: memberResponses.map((r) => r.id),
      size: memberResponses.length,
    });
  }

  return groups;
}

/**
 * Build adjacency graph where edges exist for similar responses
 *
 * @param responses - Responses in theme
 * @param threshold - Cosine similarity threshold (e.g. 0.90)
 * @returns Adjacency list: Map<index, Set<index>>
 */
function buildSimilarityGraph(
  responses: ResponseWithEmbedding[],
  threshold: number
): Map<number, Set<number>> {
  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < responses.length; i++) {
    adjacency.set(i, new Set());
  }

  // Compute all-pairs similarity (O(n²) but manageable per theme)
  // TODO: Optimize with approximate nearest neighbor (ANN) for large themes (> 300 responses)
  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const sim = cosineSimilarity(
        responses[i].embedding,
        responses[j].embedding
      );

      if (sim >= threshold) {
        adjacency.get(i)!.add(j);
        adjacency.get(j)!.add(i);
      }
    }
  }

  return adjacency;
}

/**
 * Find connected components in adjacency graph using DFS
 *
 * @param adjacency - Adjacency list
 * @param nodeCount - Total number of nodes
 * @returns Array of components (each component is array of node indices)
 */
function findConnectedComponents(
  adjacency: Map<number, Set<number>>,
  nodeCount: number
): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];

  for (let i = 0; i < nodeCount; i++) {
    if (visited.has(i)) continue;

    // DFS to find component
    const component: number[] = [];
    const stack: number[] = [i];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;

      visited.add(node);
      component.push(node);

      // Add neighbors to stack
      const neighbors = adjacency.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * Select representative response (medoid: closest to centroid)
 *
 * @param responses - Responses in group
 * @returns Index of representative in responses array
 */
function selectRepresentative(responses: ResponseWithEmbedding[]): number {
  if (responses.length === 1) return 0;

  // Compute centroid
  const centroid = computeCentroid(responses.map((r) => r.embedding));

  // Find response closest to centroid
  let bestIdx = 0;
  let bestSim = cosineSimilarity(responses[0].embedding, centroid);

  for (let i = 1; i < responses.length; i++) {
    const sim = cosineSimilarity(responses[i].embedding, centroid);
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Compute centroid of embedding vectors
 *
 * @param embeddings - Array of embedding vectors
 * @returns Centroid vector (normalized)
 */
function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error("Cannot compute centroid of empty set");
  }

  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += embedding[i];
    }
  }

  // Average
  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }

  // Normalize to unit length (for cosine similarity)
  return normalizeVector(centroid);
}

/**
 * Compute cosine similarity between two vectors
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity [-1, 1]
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same dimension");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0; // Handle zero vectors
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Normalize vector to unit length
 *
 * @param vector - Input vector
 * @returns Normalized vector
 */
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map((val) => val / magnitude);
}
