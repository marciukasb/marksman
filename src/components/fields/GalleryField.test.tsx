import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GalleryField from './GalleryField';

const photos = ['/images/a.jpg', '/images/b.jpg', '/images/c.jpg'];
const props = (onChange = vi.fn(), onAddFiles = vi.fn()) => ({
  label: 'photos',
  value: photos,
  onChange,
  onAddFiles,
  photoSrc: (url: string) => `blob:${url}`,
});

describe('GalleryField', () => {
  it('marks the first photo as the cover', () => {
    render(<GalleryField {...props()} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Cover');
    expect(items[1]).not.toHaveTextContent('Cover');
  });

  it('moves a photo right with the arrow button', () => {
    const onChange = vi.fn();
    render(<GalleryField {...props(onChange)} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Move right' })[0]);
    expect(onChange).toHaveBeenCalledWith(['/images/b.jpg', '/images/a.jpg', '/images/c.jpg']);
  });

  it('removes a photo', () => {
    const onChange = vi.fn();
    render(<GalleryField {...props(onChange)} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove photo' })[1]);
    expect(onChange).toHaveBeenCalledWith(['/images/a.jpg', '/images/c.jpg']);
  });

  it('starts as one big area with an Upload photos button', () => {
    const onAddFiles = vi.fn();
    render(<GalleryField {...props(vi.fn(), onAddFiles)} value={[]} />);
    expect(screen.getByRole('button', { name: /Upload photos/ })).toBeInTheDocument();
    const file = new File(['x'], 'bites.jpg', { type: 'image/jpeg' });
    fireEvent.drop(screen.getByRole('group', { name: 'Photo drop area' }), { dataTransfer: { files: [file], types: ['Files'] } });
    expect(onAddFiles).toHaveBeenCalledWith([file]);
  });

  it('keeps the photos inside the drop area, with a tile to add more', () => {
    render(<GalleryField {...props()} />);
    const area = screen.getByRole('group', { name: 'Photo drop area' });
    expect(within(area).getAllByRole('img')).toHaveLength(3);
    expect(within(area).getByRole('button', { name: 'Add more photos' })).toBeInTheDocument();
  });

  it('adds more photos dropped on top of the existing ones', () => {
    const onAddFiles = vi.fn();
    const onChange = vi.fn();
    render(<GalleryField {...props(onChange, onAddFiles)} />);
    const file = new File(['x'], 'bites.jpg', { type: 'image/jpeg' });
    fireEvent.drop(screen.getAllByRole('listitem')[1], { dataTransfer: { files: [file], types: ['Files'] } });
    fireEvent.drop(screen.getByRole('group', { name: 'Photo drop area' }), { dataTransfer: { files: [file], types: ['Files'] } });
    expect(onAddFiles).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the photos through photoSrc', () => {
    render(<GalleryField {...props()} />);
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'blob:/images/a.jpg');
  });
});
