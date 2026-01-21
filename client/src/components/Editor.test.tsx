import { render, screen, waitFor } from "@testing-library/react";
import { Editor } from "../components/Editor";

// Mock the api module
vi.mock("../services/api", () => ({
  api: {
    getPage: vi.fn().mockResolvedValue({ content: "# Test", path: "test.md" }),
    updatePage: vi.fn().mockResolvedValue({}),
  },
}));

describe("Editor", () => {
  it("shows empty state when no page is selected", () => {
    render(<Editor pagePath={null} onClose={vi.fn()} />);

    expect(screen.getByText(/select a page/i)).toBeInTheDocument();
  });

  it("renders editor when page is loaded", async () => {
    render(<Editor pagePath="test.md" onClose={vi.fn()} />);

    // Wait for loading to complete and textarea to appear
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
  });
});
