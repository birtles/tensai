import TagSuggestions from './TagSuggestions';
import DataStore from '../store/DataStore';
import { waitForEvents } from '../../test/testcommon';

class MockDataStore extends DataStore {
  _tags: string[] = [];

  async getTags(prefix: string, limit: number): Promise<string[]> {
    const matchingTags = this._tags
      .filter(tag => tag.startsWith(prefix))
      .sort()
      .slice(0, limit);
    return Promise.resolve(matchingTags);
  }
}

describe('TagSuggestions', () => {
  let store: MockDataStore;
  let subject: TagSuggestions;

  beforeEach(() => {
    store = new MockDataStore();
    subject = new TagSuggestions(store, {
      maxSessionTags: 3,
      maxSuggestions: 6,
    });
  });

  it('returns no tags initially', async () => {
    const result = subject.getSuggestions('');

    expect(result.initialResult).toEqual([]);
    expect(result.asyncResult).toBeTruthy();
    const asyncResult = await result.asyncResult;
    expect(asyncResult).toEqual([]);
  });

  it('returns recently added tags synchronously', () => {
    subject.recordAddedTag('A');
    subject.recordAddedTag('B');
    subject.recordAddedTag('C');
    subject.recordAddedTag('A'); // Bump A's access time
    subject.recordAddedTag('D'); // B should be dropped

    const result = subject.getSuggestions('');

    expect(result.initialResult).toEqual(['D', 'A', 'C']);
  });

  it('returns frequently used tags asynchronously', async () => {
    store._tags = ['F1', 'F2', 'F3'];
    subject.recordAddedTag('R1');
    subject.recordAddedTag('R2');
    subject.recordAddedTag('R3');

    const result = subject.getSuggestions('');

    expect(result.initialResult).toEqual(['R3', 'R2', 'R1']);
    const asyncResult = await result.asyncResult;
    expect(asyncResult).toEqual(['R3', 'R2', 'R1', 'F1', 'F2', 'F3']);
  });

  it('respects the maximum number of suggestions', async () => {
    store._tags = ['F1', 'F2', 'F3', 'F4', 'F5'];
    subject.recordAddedTag('R1');
    subject.recordAddedTag('R2');
    subject.recordAddedTag('R3');

    const result = subject.getSuggestions('');

    const asyncResult = await result.asyncResult;
    expect(asyncResult).toEqual(['R3', 'R2', 'R1', 'F1', 'F2', 'F3']);
  });

  it('de-duplicates recent and frequent tags', async () => {
    store._tags = ['A', 'C', 'E', 'G', 'I', 'K'];
    subject.recordAddedTag('A');
    subject.recordAddedTag('B');
    subject.recordAddedTag('C');

    const result = subject.getSuggestions('');

    const asyncResult = await result.asyncResult;
    expect(asyncResult).toEqual(['C', 'B', 'A', 'E', 'G', 'I']);
  });

  it('caches frequent tags', async () => {
    store._tags = ['D', 'E', 'F', 'G'];
    subject.recordAddedTag('A');
    subject.recordAddedTag('B');
    subject.recordAddedTag('C');

    // Do initial fetch
    const initialFetch = subject.getSuggestions('');
    await initialFetch.asyncResult;

    // Do a subsequent fetch
    const secondFetch = subject.getSuggestions('');
    expect(secondFetch.initialResult).toEqual(['C', 'B', 'A', 'D', 'E', 'F']);
    expect(secondFetch.asyncResult).toBeUndefined();
  });

  it('returns matching tags matching a prefix', async () => {
    store._tags = ['ABC', 'ABCD', 'AB', 'DEF'];
    subject.recordAddedTag('R1');
    subject.recordAddedTag('R2');
    subject.recordAddedTag('R3');

    const result = subject.getSuggestions('ABC');

    expect(result.initialResult).toBeUndefined();
    const asyncResult = await result.asyncResult;
    expect(asyncResult).toEqual(['ABC', 'ABCD']);
  });

  it('returns direct cache hits immediately', async () => {
    store._tags = ['ABC', 'ABCD', 'AB', 'DEF'];

    // Do initial fetch
    const initialFetch = subject.getSuggestions('AB');
    await initialFetch.asyncResult;

    // Do a subsequent fetch
    const secondFetch = subject.getSuggestions('AB');
    expect(secondFetch.initialResult).toEqual(['AB', 'ABC', 'ABCD']);
    expect(secondFetch.asyncResult).toBeUndefined();
  });

  it('returns substring cache hits immediately', async () => {
    store._tags = ['ABC', 'ABCD', 'AB', 'DEF'];

    // Do initial fetch
    const initialFetch = subject.getSuggestions('AB');
    await initialFetch.asyncResult;

    // Do a subsequent fetch
    const secondFetch = subject.getSuggestions('ABC');
    expect(secondFetch.initialResult).toEqual(['ABC', 'ABCD']);
    expect(secondFetch.asyncResult).toBeUndefined();
  });

  it('does an async lookup when a substring cache hit might represent an incomplete result', async () => {
    // We have a lot of tags such that when we search for 'AB' we'll reach the
    // limit before we get to 'AB7'.
    store._tags = [
      'AB0',
      'AB1',
      'AB2',
      'AB3',
      'AB4',
      'AB5',
      'AB6',
      'AB7',
      'AB8',
    ];

    // Do initial fetch
    const initialFetch = subject.getSuggestions('AB');
    const initialAsyncResult = await initialFetch.asyncResult;
    // Sanity check: We should only get the first six results
    expect(initialAsyncResult).toEqual([
      'AB0',
      'AB1',
      'AB2',
      'AB3',
      'AB4',
      'AB5',
    ]);

    // Do a subsequent fetch
    const secondFetch = subject.getSuggestions('AB7');
    expect(secondFetch.initialResult).toBeUndefined();
    const secondAsyncResult = await secondFetch.asyncResult;
    expect(secondAsyncResult).toEqual(['AB7']);
  });

  // XXX Test Promise rejection
  // XXX Test cache clearing
});
