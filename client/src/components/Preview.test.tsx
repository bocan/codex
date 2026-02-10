import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Preview } from "../components/Preview";
import { api } from "../services/api";
import { useEditorStore } from "../store/editorStore";
import mermaid from "mermaid";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

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

    // Ensure the preview uses deterministic content in tests.
    useEditorStore.setState({
      content: "",
      scrollSource: null,
      editorScrollPercent: 0,
      previewScrollPercent: 0,
    });

    // Provide CSS variables used by Mermaid theme initialization in jsdom.
    document.documentElement.style.setProperty("--bg-primary", "#18181b");
    document.documentElement.style.setProperty("--bg-secondary", "#27272a");
    document.documentElement.style.setProperty("--bg-tertiary", "#1f1f23");
    document.documentElement.style.setProperty("--text-primary", "#fafaf9");
    document.documentElement.style.setProperty("--border-color", "#3f3f46");
    document.documentElement.style.setProperty("--accent-color", "#818cf8");
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

  it("shows Export to PDF in export menu", async () => {
    vi.mocked(api.getPage).mockResolvedValueOnce({ path: "test.md", content: "Hello" });
    render(<Preview pagePath="test.md" />);

    await waitFor(() => expect(api.getPage).toHaveBeenCalledWith("test.md"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /export options/i }));
    expect(screen.getByRole("menuitem", { name: /export to pdf/i })).toBeInTheDocument();
  });

  it("renders Mermaid code fences and avoids rerender when code is unchanged", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg data-testid="mmd"><g><text>OK</text></g></svg>',
      bindFunctions: undefined,
      diagramType: "flowchart",
    } as unknown as { svg: string; bindFunctions?: (element: Element) => void; diagramType: string });

    document.documentElement.setAttribute("data-theme", "dark");

    const markdown = [
      "```mermaid",
      "flowchart LR",
      "  A --> B",
      "```",
    ].join("\n");

    // Prevent the async API load from overwriting the live editor content during the test.
    vi.mocked(api.getPage).mockResolvedValueOnce({ path: "test.md", content: markdown });

    useEditorStore.setState({ content: markdown });

    const { rerender } = render(<Preview pagePath="test.md" />);

    await waitFor(() => expect(vi.mocked(mermaid.render)).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("button", { name: /download diagram as svg/i }),
    ).toBeInTheDocument();

    // Rerender parent with same content: Mermaid should not redraw.
    rerender(<Preview pagePath="test.md" />);
    await waitFor(() => expect(vi.mocked(mermaid.render)).toHaveBeenCalledTimes(1));
  });
});
