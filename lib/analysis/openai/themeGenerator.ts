/**
 * Theme Generation with OpenAI
 *
 * Generates theme names and descriptions for clusters
 * Follows SRP: single responsibility of theme summarization
 */

import OpenAI from "openai";

export interface Theme {
  clusterIndex: number;
  name: string;
  description: string;
  size: number;
}

/**
 * Generate theme for a cluster of responses
 *
 * @param client - OpenAI client
 * @param responses - Array of response texts in the cluster
 * @param clusterIndex - Index of the cluster
 * @returns Theme with name and description
 */
export async function generateTheme(
  client: OpenAI,
  responses: string[],
  clusterIndex: number
): Promise<Theme> {
  if (responses.length === 0) {
    return {
      clusterIndex,
      name: "Empty Cluster",
      description: "No responses in this cluster",
      size: 0,
    };
  }

  // Take up to 20 representative responses
  const sampleSize = Math.min(20, responses.length);
  const sample = responses.slice(0, sampleSize);

  const prompt = `Analyze these user responses and create a concise theme:

Responses:
${sample.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Generate:
1. A short theme name (2-5 words)
2. A brief description (1-2 sentences) explaining the common thread

Respond in JSON format:
{
  "name": "Theme Name",
  "description": "Brief description of the theme"
}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that analyzes user feedback and identifies themes.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Lower temperature for consistency
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);

    return {
      clusterIndex,
      name: parsed.name || `Theme ${clusterIndex + 1}`,
      description:
        parsed.description || "A collection of related responses",
      size: responses.length,
    };
  } catch (error) {
    console.error(
      `[generateTheme] Failed for cluster ${clusterIndex}:`,
      error
    );

    // Fallback theme
    return {
      clusterIndex,
      name: `Theme ${clusterIndex + 1}`,
      description: `${responses.length} related responses`,
      size: responses.length,
    };
  }
}

/**
 * Generate themes for all clusters
 *
 * @param client - OpenAI client
 * @param responsesByCluster - Map of cluster index to response texts
 * @returns Array of themes
 */
export async function generateThemes(
  client: OpenAI,
  responsesByCluster: Map<number, string[]>
): Promise<Theme[]> {
  const themes: Theme[] = [];

  // Generate themes in parallel
  const promises = Array.from(responsesByCluster.entries()).map(
    ([clusterIndex, responses]) =>
      generateTheme(client, responses, clusterIndex)
  );

  const results = await Promise.allSettled(promises);

  for (const result of results) {
    if (result.status === "fulfilled") {
      themes.push(result.value);
    } else {
      console.error("[generateThemes] Theme generation failed:", result.reason);
    }
  }

  // Sort by size (largest first)
  themes.sort((a, b) => b.size - a.size);

  return themes;
}
