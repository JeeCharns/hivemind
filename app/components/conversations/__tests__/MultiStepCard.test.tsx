import { render, screen, fireEvent } from "@testing-library/react";
import { MultiStepCard } from "../MultiStepCard";
import type { ReactNode } from "react";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockDiscuss = {
  id: "discuss-1",
  slug: "test-discuss",
  type: "understand" as const,
  title: "What should we build?",
  phase: "listen_open",
  responseCount: 42,
};

const mockDecide = {
  id: "decide-1",
  slug: "test-decide",
  type: "decide" as const,
  title: "What should we build?",
  phase: "listen_open",
  responseCount: 0,
};

describe("MultiStepCard", () => {
  it("should render the conversation title", () => {
    render(
      <MultiStepCard
        hiveKey="test-hive"
        discussConversation={mockDiscuss}
        decideConversation={mockDecide}
      />
    );

    expect(screen.getByText("What should we build?")).toBeInTheDocument();
  });

  it("should show step indicators", () => {
    render(
      <MultiStepCard
        hiveKey="test-hive"
        discussConversation={mockDiscuss}
        decideConversation={mockDecide}
      />
    );

    expect(screen.getByText("Discuss")).toBeInTheDocument();
    expect(screen.getByText("Decide")).toBeInTheDocument();
  });

  it("should open menu on card click", () => {
    render(
      <MultiStepCard
        hiveKey="test-hive"
        discussConversation={mockDiscuss}
        decideConversation={mockDecide}
      />
    );

    const card = screen.getByRole("button");
    fireEvent.click(card);

    expect(screen.getByText("View Discussion")).toBeInTheDocument();
    expect(screen.getByText("View Decision")).toBeInTheDocument();
  });

  it("should close menu when clicking scrim", () => {
    render(
      <MultiStepCard
        hiveKey="test-hive"
        discussConversation={mockDiscuss}
        decideConversation={mockDecide}
      />
    );

    const card = screen.getByRole("button");
    fireEvent.click(card);

    const scrim = screen.getByTestId("card-scrim");
    fireEvent.click(scrim);

    expect(screen.queryByText("View Discussion")).not.toBeInTheDocument();
  });
});
