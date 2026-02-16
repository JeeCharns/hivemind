import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "../(auth)/login/page";

const mockSendOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const pushMock = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock("../(auth)/hooks/useAuth", () => ({
  useAuth: () => ({
    sendOtp: mockSendOtp,
    verifyOtp: mockVerifyOtp,
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
    mockSendOtp.mockReset();
    mockVerifyOtp.mockReset();
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
    expect(screen.getByRole("button", { name: /send verification code/i })).toBeInTheDocument();
  });

  it("submits email and shows OTP input", async () => {
    mockSendOtp.mockResolvedValueOnce(undefined);
    render(<Page />);

    await waitFor(() => screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    await waitFor(() => expect(mockSendOtp).toHaveBeenCalledWith("user@example.com"));

    // Should show OTP entry step
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: /enter your code/i }))
        .toBeInTheDocument()
    );
    expect(screen.getByText(/we sent a 6-digit code to/i)).toBeInTheDocument();
    expect(screen.getByText(/user@example\.com/i)).toBeInTheDocument();
  });

  it("shows error when sendOtp throws", async () => {
    mockSendOtp.mockRejectedValueOnce(new Error("fail"));
    render(<Page />);

    await waitFor(() => screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    await waitFor(() =>
      expect(screen.getByText(/fail/i)).toBeInTheDocument()
    );
  });

  it("allows changing email from OTP step", async () => {
    mockSendOtp.mockResolvedValueOnce(undefined);
    render(<Page />);

    // Go to OTP step
    await waitFor(() => screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: /enter your code/i }))
        .toBeInTheDocument()
    );

    // Click change email
    await userEvent.click(screen.getByRole("button", { name: /change email/i }));

    // Should go back to email step
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: /sign up or create account/i }))
        .toBeInTheDocument()
    );
  });
});
