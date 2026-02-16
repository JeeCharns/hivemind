import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginForm from "../../(auth)/components/LoginForm";

describe("LoginForm", () => {
  it("renders email field and calls onSubmit with value", async () => {
    const mockOnSubmit = jest.fn();
    render(<LoginForm onSubmit={mockOnSubmit} />);

    await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    expect(mockOnSubmit).toHaveBeenCalledWith("user@example.com");
  });

  it("requires email", () => {
    const mockOnSubmit = jest.fn();
    render(<LoginForm onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(emailInput).toBeRequired();
  });
});
