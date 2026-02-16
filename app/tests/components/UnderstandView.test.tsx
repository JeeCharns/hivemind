import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UnderstandView from "@/app/components/conversation/UnderstandView";
import type { UnderstandViewModel } from "@/types/conversation-understand";

const useConversationFeedbackMock = jest.fn();

jest.mock("@/lib/conversations/react/useConversationFeedback", () => ({
  useConversationFeedback: (args: unknown) => useConversationFeedbackMock(args),
}));

const baseViewModel = (): UnderstandViewModel => ({
  conversationId: "conversation-1",
  responses: [
    {
      id: "r1",
      responseText: "Response in A",
      tag: null,
      clusterIndex: 0,
      xUmap: 0.5,
      yUmap: 0.5,
    },
    {
      id: "r2",
      responseText: "Response in B",
      tag: null,
      clusterIndex: 1,
      xUmap: 0.3,
      yUmap: 0.3,
    },
  ],
  themes: [
    { clusterIndex: 0, name: "Theme A", description: null, size: 1 },
    { clusterIndex: 1, name: "Theme B", description: null, size: 1 },
  ],
  feedbackItems: [
    {
      id: "r1",
      responseText: "Response in A",
      tag: null,
      clusterIndex: 0,
      counts: { agree: 0, pass: 0, disagree: 0 },
      current: null,
    },
    {
      id: "r2",
      responseText: "Response in B",
      tag: null,
      clusterIndex: 1,
      counts: { agree: 0, pass: 0, disagree: 0 },
      current: null,
    },
  ],
});

describe("UnderstandView theme filters", () => {
  beforeAll(() => {
    if (!global.requestAnimationFrame) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      };
    }
  });

  beforeEach(() => {
    useConversationFeedbackMock.mockReset();
  });

  it("renders cluster summary cards when filter is 'All themes'", () => {
    const feedbackItems = [
      {
        id: "r1",
        responseText: "Response in A",
        tag: null,
        clusterIndex: 0,
        counts: { agree: 0, pass: 0, disagree: 0 },
        current: null,
      },
      {
        id: "r2",
        responseText: "Response in B",
        tag: null,
        clusterIndex: 1,
        counts: { agree: 0, pass: 0, disagree: 0 },
        current: null,
      },
    ];

    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      feedbackItems,
      responses: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.5,
          yUmap: 0.5,
        },
        {
          id: "r2",
          responseText: "Response in B",
          tag: null,
          clusterIndex: 1,
          xUmap: 0.3,
          yUmap: 0.3,
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    // Should see theme titles in cluster summary cards
    expect(screen.getByText("Theme A")).toBeInTheDocument();
    expect(screen.getByText("Theme B")).toBeInTheDocument();

    // Should see "Show X responses" buttons (one for each theme)
    const showButtons = screen.getAllByText(/Show 1 response/);
    expect(showButtons).toHaveLength(2);
  });

  it("shows individual responses when a cluster is selected via 'Show X responses' button", async () => {
    const user = userEvent.setup();
    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      responses: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.5,
          yUmap: 0.5,
        },
        {
          id: "r2",
          responseText: "Another response in A",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.6,
          yUmap: 0.6,
        },
        {
          id: "r3",
          responseText: "Response in B",
          tag: null,
          clusterIndex: 1,
          xUmap: 0.3,
          yUmap: 0.3,
        },
      ],
      feedbackItems: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
        {
          id: "r2",
          responseText: "Another response in A",
          tag: null,
          clusterIndex: 0,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
        {
          id: "r3",
          responseText: "Response in B",
          tag: null,
          clusterIndex: 1,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: viewModel.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    // Initially shows summary cards
    expect(screen.getByText("Theme A")).toBeInTheDocument();

    // Click "Show 2 responses" for Theme A
    const showButton = screen.getByText(/Show 2 responses/);
    await user.click(showButton);

    // Should now show the individual response list (using selector to avoid SVG titles)
    expect(screen.getByText("Response in A", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Another response in A", { selector: "p" })).toBeInTheDocument();
    // Should NOT show responses from Theme B
    expect(screen.queryByText("Response in B", { selector: "p" })).not.toBeInTheDocument();
  });

  it("renders unclustered card when unclustered responses exist", () => {
    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      responses: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.5,
          yUmap: 0.5,
        },
        {
          id: "r-unclustered",
          responseText: "Unclustered response",
          tag: null,
          clusterIndex: null,
          xUmap: null,
          yUmap: null,
        },
      ],
      feedbackItems: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
        {
          id: "r-unclustered",
          responseText: "Unclustered response",
          tag: null,
          clusterIndex: null,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: viewModel.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    // Should see unclustered card in summary view
    expect(screen.getByText("Unclustered/New responses")).toBeInTheDocument();
    // Should see "Show 1 response" buttons (one for Theme A, one for unclustered)
    const showButtons = screen.getAllByText(/Show 1 response/);
    expect(showButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("filters to unclustered responses when unclustered card is clicked", async () => {
    const user = userEvent.setup();
    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      responses: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.5,
          yUmap: 0.5,
        },
        {
          id: "r-unclustered",
          responseText: "Unclustered response",
          tag: null,
          clusterIndex: null,
          xUmap: null,
          yUmap: null,
        },
      ],
      feedbackItems: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
        {
          id: "r-unclustered",
          responseText: "Unclustered response",
          tag: null,
          clusterIndex: null,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: viewModel.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    // Click "Show 1 response" for unclustered
    const unclusteredShowButton = screen.getAllByText(/Show 1 response/)[1]; // Second one is unclustered
    await user.click(unclusteredShowButton);

    // Should show only unclustered response (using selector to avoid SVG titles)
    expect(screen.getByText("Unclustered response", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("Response in A", { selector: "p" })).not.toBeInTheDocument();
  });

  it("shows unclustered card in summary view only when unclustered responses exist", async () => {
    const viewModelWithUnclustered: UnderstandViewModel = {
      ...baseViewModel(),
      responses: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.5,
          yUmap: 0.5,
        },
        {
          id: "r-unclustered",
          responseText: "Unclustered response",
          tag: null,
          clusterIndex: null,
          xUmap: null,
          yUmap: null,
        },
      ],
      feedbackItems: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
        {
          id: "r-unclustered",
          responseText: "Unclustered response",
          tag: null,
          clusterIndex: null,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: viewModelWithUnclustered.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    const { rerender } = render(<UnderstandView viewModel={viewModelWithUnclustered} />);

    // Should see unclustered card in the summary view
    expect(screen.getByText("Unclustered/New responses")).toBeInTheDocument();

    // Now test without unclustered responses
    const viewModelWithoutUnclustered: UnderstandViewModel = {
      ...baseViewModel(),
      responses: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.5,
          yUmap: 0.5,
        },
      ],
      feedbackItems: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: viewModelWithoutUnclustered.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    rerender(<UnderstandView viewModel={viewModelWithoutUnclustered} />);

    // Should NOT see unclustered card when no unclustered responses exist
    expect(screen.queryByText("Unclustered/New responses")).not.toBeInTheDocument();
  });

  it("vote buttons work after drilling into a theme", async () => {
    const user = userEvent.setup();
    const voteMock = jest.fn();
    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      responses: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.5,
          yUmap: 0.5,
        },
      ],
      feedbackItems: [
        {
          id: "r1",
          responseText: "Response in A",
          tag: null,
          clusterIndex: 0,
          counts: { agree: 0, pass: 0, disagree: 0 },
          current: null,
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: viewModel.feedbackItems,
      vote: voteMock,
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    // First, we're in the "All themes" summary view. Click to drill into Theme A.
    const showButton = screen.getByText(/Show 1 response/);
    await user.click(showButton);

    // Now we should see the individual response with vote buttons
    const agreeButton = screen.getByRole("button", { name: "Agree" });
    await user.click(agreeButton);

    expect(voteMock).toHaveBeenCalledWith("r1", "agree");
  });

  it("shows a clear selected state and filters responses by theme", async () => {
    const user = userEvent.setup();
    const viewModel = baseViewModel();

    useConversationFeedbackMock.mockReturnValue({
      items: viewModel.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    // Initially on "All themes" summary view, should show cluster summary cards
    expect(screen.getByText("Theme A")).toBeInTheDocument();
    expect(screen.getByText("Theme B")).toBeInTheDocument();

    // Click on Theme A card to drill down
    const themeACard = screen.getByRole("button", {
      name: /Theme A Show 1 response/i,
    });
    await user.click(themeACard);

    // Should now show individual responses for Theme A only (using selector to avoid SVG titles)
    // The theme title should be shown at the top (and also in the map SVG)
    expect(screen.getAllByText("Theme A").length).toBeGreaterThan(0);
    expect(screen.getByText("Response in A", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("Response in B", { selector: "p" })).not.toBeInTheDocument();

    // Go back to "All themes" using the back button
    const backButton = screen.getByRole("button", { name: /Back to all themes/i });
    await user.click(backButton);

    // Should show cluster summaries again (themes appear in both map and cards)
    expect(screen.getAllByText("Theme A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Theme B").length).toBeGreaterThan(0);
  });

  it("applies active styles to voted button and disables other buttons", async () => {
    const user = userEvent.setup();
    const feedbackItems = [
      {
        id: "r1",
        responseText: "Response with agree vote",
        tag: null,
        clusterIndex: 0,
        counts: { agree: 5, pass: 2, disagree: 1 },
        current: "agree" as const,
      },
    ];

    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      feedbackItems,
      responses: [
        {
          id: "r1",
          responseText: "Response with agree vote",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.5,
          yUmap: 0.5,
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    // Click on Theme A card to drill down to see individual responses
    const themeACard = screen.getByRole("button", {
      name: /Theme A Show 1 response/i,
    });
    await user.click(themeACard);

    const agreeButton = screen.getByRole("button", { name: "Agree" });
    const passButton = screen.getByRole("button", { name: "Pass" });
    const disagreeButton = screen.getByRole("button", { name: "Disagree" });

    // Active button should have emerald active styles
    expect(agreeButton.className).toContain("!bg-emerald-100");
    expect(agreeButton.className).toContain("!text-emerald-800");
    expect(agreeButton.className).toContain("!border-emerald-300");

    // Other buttons should be disabled
    expect(passButton).toBeDisabled();
    expect(disagreeButton).toBeDisabled();

    // Disabled buttons should have disabled styles
    expect(passButton.className).toContain("!bg-slate-100");
    expect(passButton.className).toContain("!text-slate-400");
    expect(disagreeButton.className).toContain("!bg-slate-100");
    expect(disagreeButton.className).toContain("!text-slate-400");

    // Active button should NOT be disabled (allows toggle-off)
    expect(agreeButton).not.toBeDisabled();
  });

  it("applies orange active styles to disagree vote", async () => {
    const user = userEvent.setup();
    const feedbackItems = [
      {
        id: "r1",
        responseText: "Response with disagree vote",
        tag: null,
        clusterIndex: 0,
        counts: { agree: 1, pass: 2, disagree: 5 },
        current: "disagree" as const,
      },
    ];

    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      feedbackItems,
      responses: [
        {
          id: "r1",
          responseText: "Response with disagree vote",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.5,
          yUmap: 0.5,
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    // Click on Theme A card to drill down to see individual responses
    const themeACard = screen.getByRole("button", {
      name: /Theme A Show 1 response/i,
    });
    await user.click(themeACard);

    const disagreeButton = screen.getByRole("button", { name: "Disagree" });

    // Active disagree button should have orange styles
    expect(disagreeButton.className).toContain("!bg-orange-100");
    expect(disagreeButton.className).toContain("!text-orange-800");
    expect(disagreeButton.className).toContain("!border-orange-300");
    expect(disagreeButton).not.toBeDisabled();
  });

  it("applies slate active styles to pass vote", async () => {
    const user = userEvent.setup();
    const feedbackItems = [
      {
        id: "r1",
        responseText: "Response with pass vote",
        tag: null,
        clusterIndex: 0,
        counts: { agree: 1, pass: 5, disagree: 2 },
        current: "pass" as const,
      },
    ];

    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      feedbackItems,
      responses: [
        {
          id: "r1",
          responseText: "Response with pass vote",
          tag: null,
          clusterIndex: 0,
          xUmap: 0.5,
          yUmap: 0.5,
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    // Click on Theme A card to drill down to see individual responses
    const themeACard = screen.getByRole("button", {
      name: /Theme A Show 1 response/i,
    });
    await user.click(themeACard);

    const passButton = screen.getByRole("button", { name: "Pass" });

    // Active pass button should have darker slate styles
    expect(passButton.className).toContain("!bg-slate-200");
    expect(passButton.className).toContain("!text-slate-800");
    expect(passButton.className).toContain("!border-slate-300");
    expect(passButton).not.toBeDisabled();
  });
});
