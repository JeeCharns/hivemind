import { render, screen } from "@testing-library/react";
import PageSelector from "@/app/components/navbar/PageSelector";
import type { ReactNode } from "react";

const usePathnameMock = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

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

describe("PageSelector", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("shows the current route page even if currentPage is 'home'", () => {
    usePathnameMock.mockReturnValue("/hives/my-hive/members");

    render(
      <PageSelector hiveId="hive-id" hiveSlug="my-hive" currentPage="home" />
    );

    expect(
      screen.getByRole("button", { name: /members/i })
    ).toBeInTheDocument();
  });

  it("defaults to home when route does not match a known page", () => {
    usePathnameMock.mockReturnValue("/hives/my-hive/conversations/abc");

    render(
      <PageSelector hiveId="hive-id" hiveSlug="my-hive" currentPage="home" />
    );

    expect(screen.getByRole("button", { name: /home/i })).toBeInTheDocument();
  });
});
