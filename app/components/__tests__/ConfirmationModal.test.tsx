// app/components/__tests__/ConfirmationModal.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmationModal from "../ConfirmationModal";

describe("ConfirmationModal", () => {
  const defaultProps = {
    isOpen: true,
    title: "Confirm Action",
    message: "Are you sure?",
    confirmLabel: "Yes",
    cancelLabel: "No",
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(<ConfirmationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText("Confirm Action")).not.toBeInTheDocument();
  });

  it("renders title and message when open", () => {
    render(<ConfirmationModal {...defaultProps} />);
    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", () => {
    render(<ConfirmationModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Yes"));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button clicked", () => {
    render(<ConfirmationModal {...defaultProps} />);
    fireEvent.click(screen.getByText("No"));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when backdrop clicked", () => {
    render(<ConfirmationModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows loading state when isLoading is true", () => {
    render(<ConfirmationModal {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeDisabled();
    expect(screen.getByText("No")).toBeDisabled();
  });

  it("applies red styling for danger variant", () => {
    render(<ConfirmationModal {...defaultProps} variant="danger" />);
    const confirmButton = screen.getByText("Yes");
    expect(confirmButton).toHaveClass("bg-red-600");
  });

  it("shows error message when provided", () => {
    render(
      <ConfirmationModal {...defaultProps} error="Something went wrong" />
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
