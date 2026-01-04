-- Cluster Assignment Diagnostic Queries
-- Replace 'YOUR_CONVERSATION_ID' with your actual conversation ID

-- 1. Find "People will be free" response and its cluster
SELECT
  id,
  response_text,
  cluster_index,
  x_umap,
  y_umap,
  is_misc,
  distance_to_centroid,
  outlier_score
FROM conversation_responses
WHERE conversation_id = 'YOUR_CONVERSATION_ID'
  AND response_text ILIKE '%people will be free%';

-- 2. Get the theme for that cluster
SELECT
  t.cluster_index,
  t.name AS theme_name,
  t.description,
  t.size
FROM conversation_themes t
WHERE t.conversation_id = 'YOUR_CONVERSATION_ID'
  AND t.cluster_index = (
    SELECT cluster_index
    FROM conversation_responses
    WHERE conversation_id = 'YOUR_CONVERSATION_ID'
      AND response_text ILIKE '%people will be free%'
    LIMIT 1
  );

-- 3. Find all responses containing "test" and their clusters
SELECT
  cluster_index,
  COUNT(*) as count,
  STRING_AGG(SUBSTRING(response_text, 1, 60), ' | ') as sample_texts
FROM conversation_responses
WHERE conversation_id = 'YOUR_CONVERSATION_ID'
  AND response_text ILIKE '%test%'
GROUP BY cluster_index
ORDER BY count DESC;

-- 4. Get themes for clusters with "test" responses
SELECT
  t.cluster_index,
  t.name AS theme_name,
  t.description,
  COUNT(r.id) AS test_response_count
FROM conversation_themes t
LEFT JOIN conversation_responses r
  ON r.conversation_id = t.conversation_id
  AND r.cluster_index = t.cluster_index
  AND r.response_text ILIKE '%test%'
WHERE t.conversation_id = 'YOUR_CONVERSATION_ID'
GROUP BY t.cluster_index, t.name, t.description
HAVING COUNT(r.id) > 0
ORDER BY test_response_count DESC;

-- 5. Check cluster distribution
SELECT
  r.cluster_index,
  t.name AS theme_name,
  COUNT(r.id) AS response_count,
  ROUND(100.0 * COUNT(r.id) / SUM(COUNT(r.id)) OVER (), 1) AS percentage
FROM conversation_responses r
LEFT JOIN conversation_themes t
  ON t.conversation_id = r.conversation_id
  AND t.cluster_index = r.cluster_index
WHERE r.conversation_id = 'YOUR_CONVERSATION_ID'
GROUP BY r.cluster_index, t.name
ORDER BY response_count DESC;

-- 6. Find freedom-related responses and their cluster assignments
SELECT
  r.cluster_index,
  t.name AS theme_name,
  r.response_text,
  r.is_misc,
  r.outlier_score
FROM conversation_responses r
LEFT JOIN conversation_themes t
  ON t.conversation_id = r.conversation_id
  AND t.cluster_index = r.cluster_index
WHERE r.conversation_id = 'YOUR_CONVERSATION_ID'
  AND (
    r.response_text ILIKE '%free%'
    OR r.response_text ILIKE '%freedom%'
    OR r.response_text ILIKE '%liberty%'
    OR r.response_text ILIKE '%quality%life%'
  )
ORDER BY r.cluster_index, r.response_text;

-- 7. Compare spatial proximity vs cluster assignment
-- (Find responses close in 2D space but in different clusters)
WITH response_pairs AS (
  SELECT
    r1.id AS id1,
    r1.response_text AS text1,
    r1.cluster_index AS cluster1,
    r2.id AS id2,
    r2.response_text AS text2,
    r2.cluster_index AS cluster2,
    SQRT(
      POWER(r1.x_umap - r2.x_umap, 2) +
      POWER(r1.y_umap - r2.y_umap, 2)
    ) AS distance_2d
  FROM conversation_responses r1
  CROSS JOIN conversation_responses r2
  WHERE r1.conversation_id = 'YOUR_CONVERSATION_ID'
    AND r2.conversation_id = 'YOUR_CONVERSATION_ID'
    AND r1.id < r2.id  -- Avoid duplicates
    AND r1.cluster_index != r2.cluster_index  -- Different clusters
)
SELECT
  SUBSTRING(text1, 1, 50) AS response_1,
  cluster1,
  SUBSTRING(text2, 1, 50) AS response_2,
  cluster2,
  ROUND(distance_2d::numeric, 4) AS spatial_distance
FROM response_pairs
WHERE distance_2d < 0.1  -- Very close in 2D space
ORDER BY distance_2d ASC
LIMIT 20;

-- 8. Find outliers that might be misclassified
SELECT
  r.cluster_index,
  t.name AS theme_name,
  SUBSTRING(r.response_text, 1, 80) AS text,
  r.outlier_score,
  r.distance_to_centroid,
  r.is_misc
FROM conversation_responses r
LEFT JOIN conversation_themes t
  ON t.conversation_id = r.conversation_id
  AND t.cluster_index = r.cluster_index
WHERE r.conversation_id = 'YOUR_CONVERSATION_ID'
  AND r.outlier_score > 2.5  -- High outlier score
  AND NOT r.is_misc  -- But not flagged as misc
ORDER BY r.outlier_score DESC
LIMIT 20;
