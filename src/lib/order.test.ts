import { describe, it, expect } from 'vitest';
import { insertAt, moveItem } from './order';

describe('moveItem', () => {
  it('moves the last item to the front', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('moves the first item one to the right', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('ignores moves outside the list', () => {
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });
});

describe('insertAt', () => {
  it('inserts text at the cursor', () => {
    expect(insertAt('ab', 1, 'X')).toBe('aXb');
  });

  it('appends when the cursor is past the end', () => {
    expect(insertAt('ab', 9, 'X')).toBe('abX');
  });
});
