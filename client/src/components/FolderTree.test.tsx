import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderTree } from '../components/FolderTree';
import { FolderNode } from '../types';

const mockTree: FolderNode = {
  name: 'root',
  path: '/',
  type: 'folder',
  children: [
    {
      name: 'Projects',
      path: 'Projects',
      type: 'folder',
      children: [],
    },
    {
      name: 'Notes',
      path: 'Notes',
      type: 'folder',
      children: [],
    },
  ],
};

describe('FolderTree', () => {
  it('renders folder tree', () => {
    const onSelect = vi.fn();
    const onRefresh = vi.fn();

    render(
      <FolderTree
        root={mockTree}
        onSelectFolder={onSelect}
        selectedFolder={null}
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByText(/root/i)).toBeInTheDocument();
    expect(screen.getByText(/Projects/i)).toBeInTheDocument();
    expect(screen.getByText(/Notes/i)).toBeInTheDocument();
  });

  it('calls onSelectFolder when folder is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onRefresh = vi.fn();

    render(
      <FolderTree
        root={mockTree}
        onSelectFolder={onSelect}
        selectedFolder={null}
        onRefresh={onRefresh}
      />
    );

    const projectsFolder = screen.getByText(/Projects/i);
    await user.click(projectsFolder);

    expect(onSelect).toHaveBeenCalledWith('Projects');
  });
});
