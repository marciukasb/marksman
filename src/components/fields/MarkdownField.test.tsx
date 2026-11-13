import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MarkdownField from './MarkdownField';

vi.mock('@uiw/react-md-editor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="body" value={value} onChange={e => onChange(e.target.value)} />
  ),
  commands: { getCommands: () => [], divider: {} },
}));

describe('MarkdownField', () => {
  it('keeps text typed while a dropped photo is being prepared', async () => {
    let finish: (r: { urls: string[]; errors: string[] }) => void = () => {};
    const onAddFiles = vi.fn(() => new Promise<{ urls: string[]; errors: string[] }>(resolve => { finish = resolve; }));
    let latest = '';
    function Harness() {
      const [value, setValue] = useState('Pradžia');
      latest = value;
      return <MarkdownField name="body" value={value} onChange={setValue} photoSrc={u => u} onAddFiles={onAddFiles} />;
    }
    render(<Harness />);
    const textarea = screen.getByLabelText('body') as HTMLTextAreaElement;
    textarea.setSelectionRange(7, 7);
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.drop(textarea, { dataTransfer: { files: [file], types: ['Files'] } });
    fireEvent.change(textarea, { target: { value: 'Pradžia ir daugiau' } });
    await act(async () => finish({ urls: ['/images/a.jpg'], errors: [] }));
    await waitFor(() => expect(latest).toContain('![](/images/a.jpg)'));
    expect(latest).toContain('ir daugiau');
  });
});
