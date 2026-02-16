// app/components/navbar/__tests__/LeaveHiveButton.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import LeaveHiveButton from "../LeaveHiveButton";
import { leaveHiveAction } from "@/app/hives/[hiveId]/members/actions";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/app/hives/[hiveId]/members/actions", () => ({
  leaveHiveAction: jest.fn(),
}));

describe("LeaveHiveButton", () => {
  const mockRouter = { push: jest.fn() };
  const mockLeaveHiveAction = leaveHiveAction as jest.MockedFunction<
    typeof leaveHiveAction
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  it("renders the leave button", () => {
    render(
      <LeaveHiveButton
        hiveId="123"
        hiveName="Test Hive"
        onMenuClose={jest.fn()}
      />
    );
    expect(screen.getByText("leave hive")).toBeInTheDocument();
  });

  it("opens modal when button clicked", () => {
    render(
      <LeaveHiveButton
        hiveId="123"
        hiveName="Test Hive"
        onMenuClose={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText("leave hive"));
    expect(screen.getByText("Leave Test Hive?")).toBeInTheDocument();
  });

  it("closes modal when cancel clicked", () => {
    render(
      <LeaveHiveButton
        hiveId="123"
        hiveName="Test Hive"
        onMenuClose={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText("leave hive"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Leave Test Hive?")).not.toBeInTheDocument();
  });

  it("calls leaveHiveAction and redirects on success", async () => {
    mockLeaveHiveAction.mockResolvedValue({ success: true });
    const mockOnMenuClose = jest.fn();

    render(
      <LeaveHiveButton
        hiveId="123"
        hiveName="Test Hive"
        onMenuClose={mockOnMenuClose}
      />
    );
    fireEvent.click(screen.getByText("leave hive"));
    fireEvent.click(screen.getByText("Leave"));

    await waitFor(() => {
      expect(mockLeaveHiveAction).toHaveBeenCalledWith("123");
      expect(mockOnMenuClose).toHaveBeenCalled();
      expect(mockRouter.push).toHaveBeenCalledWith("/hives");
    });
  });

  it("shows error message on failure", async () => {
    mockLeaveHiveAction.mockResolvedValue({
      success: false,
      error: "Cannot leave",
    });

    render(
      <LeaveHiveButton
        hiveId="123"
        hiveName="Test Hive"
        onMenuClose={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText("leave hive"));
    fireEvent.click(screen.getByText("Leave"));

    await waitFor(() => {
      expect(screen.getByText("Cannot leave")).toBeInTheDocument();
    });
  });
});
