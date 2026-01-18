import { render, screen } from '@testing-library/react';
import { Editor } from '../components/Editor';

// Mock the api module
vi.mock('../services/api', () => ({
  api: {
    getPage: vi.fn(),
    updatePage: vi.fn(),
  },
}));

describe('Editor', () => {
  it('shows empty state when no page is selected', () => {
    render(<Editor pagePath={null} onClose={vi.fn()} />);

    expect(screen.getByText(/select a page/i)).toBeInTheDocument();
  });

  it('renders editor when page is selected', () => {
    render(<Editor pagePath="test.md" onClose={vi.fn()} />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
