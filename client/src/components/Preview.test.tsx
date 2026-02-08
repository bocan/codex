import { render, screen, waitFor } from "@testing-library/react";
import { Preview } from "../components/Preview";
import { api } from "../services/api";

// Mock the api module
vi.mock("../services/api", () => ({
  api: {
    getPage: vi.fn(),
  },
}));

describe("Preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getPage).mockResolvedValue({ path: "test.md", content: "" });
  });

  it("shows empty state when no page is selected", () => {
    render(<Preview pagePath={null} />);

    expect(screen.getByText(/preview will appear here/i)).toBeInTheDocument();
  });

  it("renders preview header when page is selected", async () => {
    render(<Preview pagePath="test.md" />);

    expect(screen.getByText(/preview/i)).toBeInTheDocument();

    // Let the initial async load settle to avoid act(...) warnings.
    await waitFor(() => expect(api.getPage).toHaveBeenCalledWith("test.md"));
    await waitFor(() =>
      expect(screen.queryByLabelText(/loading/i)).not.toBeInTheDocument(),
    );
  });
});
