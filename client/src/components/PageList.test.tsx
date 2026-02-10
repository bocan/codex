import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageList } from "./PageList";
import { api } from "../services/api";

vi.mock("../services/api", () => ({
  api: {
    getPages: vi.fn(),
    getTemplates: vi.fn(),
    createPage: vi.fn(),
  },
}));

describe("PageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getPages).mockResolvedValue([]);
    vi.mocked(api.getTemplates).mockResolvedValue([]);
  });

  it("opens template picker when clicking +", async () => {
    render(
      <PageList
        selectedFolder={null}
        selectedPage={null}
        onSelectPage={vi.fn()}
        onRefresh={vi.fn()}
        folderTree={null}
      />,
    );

    // Wait for initial pages load.
    await waitFor(() => expect(api.getPages).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /create new page/i }));

    expect(
      screen.getByRole("dialog", { name: /create page from template/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /blank page/i })).toBeInTheDocument();
  });
});
