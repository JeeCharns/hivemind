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
  responses: [],
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

  it("shows a clear selected state and filters responses by theme", async () => {
    const user = userEvent.setup();
    const viewModel = baseViewModel();

    useConversationFeedbackMock.mockReturnValue({
      items: viewModel.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    const filterButton = screen.getByRole("button", { name: "All themes" });

    expect(screen.getByText("Response in A")).toBeInTheDocument();
    expect(screen.getByText("Response in B")).toBeInTheDocument();

    await user.click(filterButton);
    await user.click(screen.getByRole("button", { name: "Theme A" }));

    expect(screen.getByRole("button", { name: "Theme A" })).toBeInTheDocument();
    expect(screen.getByText("Response in A")).toBeInTheDocument();
    expect(screen.queryByText("Response in B")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Theme A" }));
    await user.click(screen.getByRole("button", { name: "All themes" }));

    expect(screen.getByRole("button", { name: "All themes" })).toBeInTheDocument();
    expect(screen.getByText("Response in A")).toBeInTheDocument();
    expect(screen.getByText("Response in B")).toBeInTheDocument();
  });

  it("shows most frequently mentioned groups first when viewing All themes", () => {
    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      frequentlyMentionedGroups: [
        {
          groupId: "group-small",
          clusterIndex: 0,
          representative: {
            id: "rep-small",
            responseText: "Smaller group representative",
            tag: null,
            counts: { agree: 0, pass: 0, disagree: 0 },
            current: null,
          },
          similarResponses: [{ id: "s1", responseText: "Similar 1", tag: null }],
          size: 2,
          params: { simThreshold: 0.8, minGroupSize: 2, algorithmVersion: "test" },
        },
        {
          groupId: "group-large",
          clusterIndex: 1,
          representative: {
            id: "rep-large",
            responseText: "Larger group representative",
            tag: null,
            counts: { agree: 0, pass: 0, disagree: 0 },
            current: null,
          },
          similarResponses: [
            { id: "l1", responseText: "Similar 1", tag: null },
            { id: "l2", responseText: "Similar 2", tag: null },
            { id: "l3", responseText: "Similar 3", tag: null },
          ],
          size: 4,
          params: { simThreshold: 0.8, minGroupSize: 2, algorithmVersion: "test" },
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: viewModel.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    const larger = screen.getByText("Larger group representative");
    const smaller = screen.getByText("Smaller group representative");

    // Larger group should render above smaller group
    expect(
      larger.compareDocumentPosition(smaller) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("applies active styles to voted button and disables other buttons", () => {
    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      feedbackItems: [
        {
          id: "r1",
          responseText: "Response with agree vote",
          tag: null,
          clusterIndex: 0,
          counts: { agree: 5, pass: 2, disagree: 1 },
          current: "agree",
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: viewModel.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

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

  it("applies orange active styles to disagree vote", () => {
    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      feedbackItems: [
        {
          id: "r1",
          responseText: "Response with disagree vote",
          tag: null,
          clusterIndex: 0,
          counts: { agree: 1, pass: 2, disagree: 5 },
          current: "disagree",
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: viewModel.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    const disagreeButton = screen.getByRole("button", { name: "Disagree" });

    // Active disagree button should have orange styles
    expect(disagreeButton.className).toContain("!bg-orange-100");
    expect(disagreeButton.className).toContain("!text-orange-800");
    expect(disagreeButton.className).toContain("!border-orange-300");
    expect(disagreeButton).not.toBeDisabled();
  });

  it("applies slate active styles to pass vote", () => {
    const viewModel: UnderstandViewModel = {
      ...baseViewModel(),
      feedbackItems: [
        {
          id: "r1",
          responseText: "Response with pass vote",
          tag: null,
          clusterIndex: 0,
          counts: { agree: 1, pass: 5, disagree: 2 },
          current: "pass",
        },
      ],
    };

    useConversationFeedbackMock.mockReturnValue({
      items: viewModel.feedbackItems,
      vote: jest.fn(),
      loadingId: null,
    });

    render(<UnderstandView viewModel={viewModel} />);

    const passButton = screen.getByRole("button", { name: "Pass" });

    // Active pass button should have darker slate styles
    expect(passButton.className).toContain("!bg-slate-200");
    expect(passButton.className).toContain("!text-slate-800");
    expect(passButton.className).toContain("!border-slate-300");
    expect(passButton).not.toBeDisabled();
  });
});
