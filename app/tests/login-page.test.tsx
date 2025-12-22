import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "../(auth)/login/page";

const mockLogin = jest.fn();
const pushMock = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock("../(auth)/hooks/useAuth", () => ({
  useAuth: () => ({
    login: mockLogin,
    loading: false,
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock,
}));

jest.mock("@/lib/auth/react/useSession", () => ({
  useSession: () => ({ isAuthenticated: false, isLoading: false }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    pushMock.mockReset();
    searchParamsMock = new URLSearchParams();
  });

  it("renders heading and login form after loading", async () => {
    render(<Page />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: /sign up or create account/i }))
        .toBeInTheDocument()
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send a magic link/i })).toBeInTheDocument();
  });

  it("submits email to login", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    render(<Page />);

    await waitFor(() => screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send a magic link/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("user@example.com", ""));
    expect(screen.getByText(/magic link sent to user@example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check your email/i })).toBeDisabled();
  });

  it("shows error when login throws", async () => {
    mockLogin.mockRejectedValueOnce(new Error("fail"));
    render(<Page />);

    await waitFor(() => screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send a magic link/i }));

    await waitFor(() =>
      expect(screen.getByText(/fail/i)).toBeInTheDocument()
    );
  });
});
