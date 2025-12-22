import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UnderstandViewContainer from "@/app/components/conversation/UnderstandViewContainer";
import type { UnderstandViewModel } from "@/types/conversation-understand";

jest.mock("@/app/components/conversation/UnderstandView", () => ({
  __esModule: true,
  default: function MockUnderstandView() {
    return <div data-testid="understand-view" />;
  },
}));

jest.mock("@/lib/conversations/react/useConversationAnalysisRealtime", () => ({
  __esModule: true,
  useConversationAnalysisRealtime: () => ({ status: "disconnected", error: null }),
}));

jest.mock("@/lib/conversations/react/useAnalysisStatus", () => ({
  __esModule: true,
  useAnalysisStatus: () => ({ data: null }),
}));

function makeViewModel(
  overrides: Partial<UnderstandViewModel> = {}
): UnderstandViewModel {
  return {
    conversationId: "conv-1",
    responses: [],
    themes: [],
    feedbackItems: [],
    analysisStatus: "ready",
    responseCount: 20,
    threshold: 20,
    isAnalysisStale: true,
    newResponsesSinceAnalysis: 0,
    ...overrides,
  };
}

describe("UnderstandViewContainer", () => {
  it("does not show the stale-analysis banner when < 10 new responses since last analysis", () => {
    render(
      <UnderstandViewContainer
        initialViewModel={makeViewModel({ newResponsesSinceAnalysis: 9 })}
      />
    );

    expect(screen.queryByText(/analysis out of date/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("understand-view")).toBeInTheDocument();
  });

  it("shows the stale-analysis banner when >= 10 new responses since last analysis", () => {
    render(
      <UnderstandViewContainer
        initialViewModel={makeViewModel({ newResponsesSinceAnalysis: 10 })}
      />
    );

    expect(screen.getByText(/analysis out of date/i)).toBeInTheDocument();
  });

  it("switches back to the analysis loading state when regenerate is clicked", async () => {
    const previousFetch = (globalThis as unknown as { fetch?: unknown }).fetch;
    const fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/analyze")) {
          return {
            ok: true,
            json: async () => ({ status: "queued" }),
          } as Response;
        }

        if (url.includes("/understand")) {
          void init;
          return {
            ok: true,
            json: async () =>
              makeViewModel({
                analysisStatus: "not_started",
                newResponsesSinceAnalysis: 10,
              }),
          } as Response;
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }
    );
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

    const user = userEvent.setup();

    render(
      <UnderstandViewContainer
        initialViewModel={makeViewModel({ newResponsesSinceAnalysis: 10 })}
      />
    );

    await user.click(screen.getByRole("button", { name: /regenerate/i }));

    expect(await screen.findByText(/generating theme map/i)).toBeInTheDocument();
    expect(screen.queryByTestId("understand-view")).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/conv-1/analyze",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "regenerate", strategy: "auto" }),
      })
    );
    (globalThis as unknown as { fetch?: unknown }).fetch = previousFetch;
  });
});
