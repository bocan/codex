import { render, screen } from '@testing-library/react';
import { Preview } from '../components/Preview';

// Mock the api module
vi.mock('../services/api', () => ({
  api: {
    getPage: vi.fn(),
  },
}));

describe('Preview', () => {
  it('shows empty state when no page is selected', () => {
    render(<Preview pagePath={null} />);

    expect(screen.getByText(/preview will appear here/i)).toBeInTheDocument();
  });

  it('renders preview header when page is selected', () => {
    render(<Preview pagePath="test.md" />);

    expect(screen.getByText(/preview/i)).toBeInTheDocument();
  });
});
