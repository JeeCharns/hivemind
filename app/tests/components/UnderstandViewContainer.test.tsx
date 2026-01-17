import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UnderstandViewContainer from "@/app/components/conversation/UnderstandViewContainer";
import type { UnderstandViewModel } from "@/types/conversation-understand";

jest.mock("@/app/components/conversation/UnderstandView", () => ({
  __esModule: true,
  default: function MockUnderstandView({ analysisInProgress }: { analysisInProgress?: boolean }) {
    return (
      <div data-testid="understand-view" data-analysis-in-progress={analysisInProgress}>
        {analysisInProgress && <div>Left column loading overlay</div>}
      </div>
    );
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
        isAdmin
      />
    );

    expect(screen.queryByText(/analysis out of date/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("understand-view")).toBeInTheDocument();
  });

  it("shows the stale-analysis banner when >= 10 new responses since last analysis", () => {
    render(
      <UnderstandViewContainer
        initialViewModel={makeViewModel({ newResponsesSinceAnalysis: 10 })}
        isAdmin
      />
    );

    expect(screen.getByText(/analysis out of date/i)).toBeInTheDocument();
  });

  it("shows the generate banner for admins when analysis has not run", () => {
    render(
      <UnderstandViewContainer
        initialViewModel={makeViewModel({
          analysisStatus: null,
          analysisResponseCount: null,
          isAnalysisStale: false,
          newResponsesSinceAnalysis: 0,
          themes: [],
        })}
        isAdmin
      />
    );

    expect(screen.getByText(/ready to generate themes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
  });

  it("shows the generate banner without the button for non-admins", () => {
    render(
      <UnderstandViewContainer
        initialViewModel={makeViewModel({
          analysisStatus: null,
          analysisResponseCount: null,
          isAnalysisStale: false,
          newResponsesSinceAnalysis: 0,
          themes: [],
        })}
      />
    );

    expect(screen.getByText(/ready to generate themes/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
  });

  it("shows partial loading (left column only) when regenerate is clicked and responses exist", async () => {
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
                responses: [
                  {
                    id: "resp-1",
                    responseText: "test response",
                    tag: null,
                    clusterIndex: 0,
                    xUmap: 0.5,
                    yUmap: 0.5,
                  },
                ],
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
        initialViewModel={makeViewModel({
          newResponsesSinceAnalysis: 10,
          responses: [
            {
              id: "resp-1",
              responseText: "test response",
              tag: null,
              clusterIndex: 0,
              xUmap: 0.5,
              yUmap: 0.5,
            },
          ],
        })}
        isAdmin
      />
    );

    await user.click(screen.getByRole("button", { name: /regenerate/i }));

    // The view should still be rendered (partial loading, not full-page loading)
    expect(screen.getByTestId("understand-view")).toBeInTheDocument();

    // Verify the regenerate button is hidden while analysis is in progress
    expect(screen.queryByRole("button", { name: /regenerate/i })).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/conv-1/analyze",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "regenerate", strategy: "full" }),
      })
    );
    (globalThis as unknown as { fetch?: unknown }).fetch = previousFetch;
  });

  it("shows full-page loading when analysis is in progress with no existing responses", async () => {
    render(
      <UnderstandViewContainer
        initialViewModel={makeViewModel({
          analysisStatus: "analyzing",
          responses: [],
          newResponsesSinceAnalysis: 0,
        })}
        isAdmin
      />
    );

    expect(screen.getByText(/generating theme map/i)).toBeInTheDocument();
    expect(screen.queryByTestId("understand-view")).not.toBeInTheDocument();
  });

  it("hides the regenerate button while analysis is in progress", () => {
    render(
      <UnderstandViewContainer
        initialViewModel={makeViewModel({
          analysisStatus: "analyzing",
          newResponsesSinceAnalysis: 10,
          responses: [
            {
              id: "resp-1",
              responseText: "test response",
              tag: null,
              clusterIndex: 0,
              xUmap: 0.5,
              yUmap: 0.5,
            },
          ],
        })}
        isAdmin
      />
    );

    // Regenerate button should not be shown while analysis is in progress
    expect(screen.queryByRole("button", { name: /regenerate/i })).not.toBeInTheDocument();

    // But the view should still be rendered (partial loading mode)
    expect(screen.getByTestId("understand-view")).toBeInTheDocument();
  });
});
