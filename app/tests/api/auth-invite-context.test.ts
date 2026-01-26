/** @jest-environment node */
import { GET } from "@/app/api/auth/invite-context/route";
import { getInviteCookie, clearInviteCookie } from "@/lib/auth/server/inviteCookie";

jest.mock("@/lib/auth/server/inviteCookie");

const mockGetInviteCookie = getInviteCookie as jest.MockedFunction<typeof getInviteCookie>;
const mockClearInviteCookie = clearInviteCookie as jest.MockedFunction<typeof clearInviteCookie>;

describe("GET /api/auth/invite-context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return token and clear cookie when token exists", async () => {
    const token = "test-invite-token-abc123";
    mockGetInviteCookie.mockResolvedValue(token);
    mockClearInviteCookie.mockResolvedValue();

    const response = await GET();
    const data = await response.json();

    expect(mockGetInviteCookie).toHaveBeenCalled();
    expect(mockClearInviteCookie).toHaveBeenCalled();
    expect(data).toEqual({ token });
  });

  it("should return null token when no cookie exists", async () => {
    mockGetInviteCookie.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(mockGetInviteCookie).toHaveBeenCalled();
    expect(mockClearInviteCookie).not.toHaveBeenCalled();
    expect(data).toEqual({ token: null });
  });
});
