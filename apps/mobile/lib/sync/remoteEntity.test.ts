import { describe, expect, it } from 'vitest';
import { isLocalProjectionEntityRow } from './remoteEntity';

describe('local projection entity rows', () => {
  it('recognizes a local optimistic row before server hydration', () => {
    expect(isLocalProjectionEntityRow({
      _id: 'garden:local',
      entityUuid: 'garden:local',
      _pending: true,
    })).toBe(true);
  });

  it('does not suppress remote queries for server-backed rows', () => {
    expect(isLocalProjectionEntityRow({
      _id: 'j server id',
      entityUuid: 'garden:local',
      _pending: true,
    })).toBe(false);
    expect(isLocalProjectionEntityRow(null)).toBe(false);
  });

  it('recognizes a local row retained for retry without a pending marker', () => {
    expect(isLocalProjectionEntityRow({
      _id: 'garden:retry',
      entityUuid: 'garden:retry',
    })).toBe(true);
  });
});
