import { saveResponseEmbeddings } from "../saveResponseEmbeddings";
import { createMockSupabaseQuery } from "./testUtils";

describe("saveResponseEmbeddings", () => {
  it("uses upsert on response_id for idempotency", async () => {
    const { supabase, getCallLog } = createMockSupabaseQuery();

    await saveResponseEmbeddings(
      supabase,
      "conv-1",
      [
        { id: "1", text: "A" },
        { id: "2", text: "B" },
      ],
      [
        [0.1, 0.2],
        [0.3, 0.4],
      ]
    );

    const calls = getCallLog().filter((c) => c.table === "conversation_response_embeddings");
    expect(calls.some((c) => c.method === "upsert")).toBe(true);
    expect(calls.some((c) => c.method === "insert")).toBe(false);
  });
});

