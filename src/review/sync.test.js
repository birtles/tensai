/* global beforeEach, describe, expect, it, jest */

import subject from './sync';
import { queryAvailableCards, updateReviewCard } from './actions';
import reducer from './reducer';
import { getReviewSummary } from './selectors';
import ReviewState from './states';

jest.useFakeTimers();

class MockCardStore {
  constructor() {
    this.cbs = {};
    this.changes = {
      on: (type, cb) => {
        if (this.cbs[type]) {
          this.cbs[type].push(cb);
        } else {
          this.cbs[type] = [cb];
        }
      },
    };
  }

  __triggerChange(type, change) {
    if (!this.cbs[type]) {
      return;
    }

    for (const cb of this.cbs[type]) {
      cb(change);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async getReview() {
    return null;
  }
}

class MockStateStore {
  constructor() {
    this.state = {};
    this.actions = [];
  }

  subscribe(cb) {
    this.cb = cb;
  }

  dispatch(action) {
    this.actions.push(action);
  }

  getState() {
    return this.state;
  }

  __update(newState) {
    this.state = newState;

    if (this.cb) {
      this.cb();
    }
  }
}

// Mock selectors from other modules we depend on
jest.mock('../route/selectors', () => ({
  getScreen: state => state.screen,
}));

const initialState = reducer(undefined, { type: 'NONE' });

describe('review:sync', () => {
  let cardStore;
  let stateStore;

  beforeEach(() => {
    cardStore = new MockCardStore();
    stateStore = new MockStateStore();

    setTimeout.mockClear();
    clearTimeout.mockClear();
  });

  describe('available cards', () => {
    it('triggers an update immediately when cards are needed and there are none', () => {
      subject(cardStore, stateStore);
      stateStore.__update({
        screen: 'review',
        review: initialState,
      });

      expect(stateStore.actions).toEqual([queryAvailableCards()]);
      expect(setTimeout).toHaveBeenCalledTimes(0);
    });

    it('triggers an update immediately when cards are newly-needed due to a state change, even if there are some', () => {
      subject(cardStore, stateStore);
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          availableCards: { newCards: 2, overdueCards: 3 },
        },
      });

      expect(stateStore.actions).toEqual([queryAvailableCards()]);
      expect(setTimeout).toHaveBeenCalledTimes(0);
    });

    it('triggers a delayed update when a card is added', () => {
      subject(cardStore, stateStore);
      stateStore.__update({
        screen: 'review',
        review: initialState,
      });
      expect(stateStore.actions).toEqual([queryAvailableCards()]);
      expect(setTimeout).toHaveBeenCalledTimes(0);

      cardStore.__triggerChange('card', {});

      expect(setTimeout).toHaveBeenCalledTimes(1);

      jest.runAllTimers();
      expect(stateStore.actions).toEqual([
        queryAvailableCards(),
        queryAvailableCards(),
      ]);
    });

    it('cancels a delayed update when cards are needed immediately', () => {
      subject(cardStore, stateStore);
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          availableCards: { newCards: 2, overdueCards: 3 },
        },
      });
      expect(stateStore.actions).toEqual([queryAvailableCards()]);

      // Trigger a delayed update
      cardStore.__triggerChange('card', {});
      expect(setTimeout).toHaveBeenCalledTimes(1);

      // Then trigger an immediate update
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          availableCards: undefined,
        },
      });
      expect(clearTimeout).toHaveBeenCalledTimes(1);
      expect(stateStore.actions).toEqual([
        queryAvailableCards(),
        queryAvailableCards(),
      ]);
    });

    it('cancels a delayed update when cards are no longer needed', () => {
      subject(cardStore, stateStore);
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          availableCards: { newCards: 2, overdueCards: 3 },
        },
      });
      expect(stateStore.actions).toEqual([queryAvailableCards()]);

      // Trigger a delayed update
      cardStore.__triggerChange('card', {});
      expect(setTimeout).toHaveBeenCalledTimes(1);

      // Then change screen
      stateStore.__update({
        screen: 'home',
        review: initialState,
      });
      expect(clearTimeout).toHaveBeenCalledTimes(1);
      expect(stateStore.actions).toEqual([queryAvailableCards()]);
    });

    it('does NOT trigger an update when cards are already being loaded', () => {
      subject(cardStore, stateStore);
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          loadingAvailableCards: true,
        },
      });

      expect(stateStore.actions).toEqual([]);
      expect(setTimeout).toHaveBeenCalledTimes(0);
    });

    it('does NOT trigger an update when the progress is being saved', () => {
      subject(cardStore, stateStore);
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          savingProgress: true,
        },
      });

      expect(stateStore.actions).toEqual([]);
      expect(setTimeout).toHaveBeenCalledTimes(0);
    });

    it('does NOT trigger an update when a card is added when not in an appropriate state', () => {
      subject(cardStore, stateStore);
      stateStore.__update({
        screen: 'home',
        review: initialState,
      });
      expect(stateStore.actions).toEqual([]);
      expect(setTimeout).toHaveBeenCalledTimes(0);

      cardStore.__triggerChange('card', {});

      expect(stateStore.actions).toEqual([]);
      expect(setTimeout).toHaveBeenCalledTimes(0);
    });

    it('batches updates from multiple card changes', () => {
      subject(cardStore, stateStore);
      stateStore.__update({
        screen: 'review',
        review: initialState,
      });
      expect(stateStore.actions).toEqual([queryAvailableCards()]);

      cardStore.__triggerChange('card', {});
      cardStore.__triggerChange('card', {});
      cardStore.__triggerChange('card', {});

      jest.runAllTimers();
      expect(stateStore.actions).toEqual([
        queryAvailableCards(),
        queryAvailableCards(),
      ]);
    });
  });

  describe('review cards', () => {
    it('triggers an update when the current card is updated', () => {
      subject(cardStore, stateStore);

      const card = {
        _id: 'abc',
        question: 'Question',
        answer: 'Answer',
      };
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          currentCard: card,
        },
      });

      const updatedCard = {
        ...card,
        question: 'Updated question',
      };
      cardStore.__triggerChange('card', {
        id: 'abc',
        doc: updatedCard,
      });

      expect(stateStore.actions).toContainEqual(updateReviewCard(updatedCard));
    });

    it('triggers an update when an unreviewed card is updated', () => {
      subject(cardStore, stateStore);

      const card = {
        _id: 'abc',
        question: 'Question',
        answer: 'Answer',
      };
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          heap: [card],
        },
      });

      const updatedCard = {
        ...card,
        question: 'Updated question',
      };
      cardStore.__triggerChange('card', {
        id: 'abc',
        doc: updatedCard,
      });

      expect(stateStore.actions).toContainEqual(updateReviewCard(updatedCard));
    });

    it('triggers an update when a failed card is updated', () => {
      subject(cardStore, stateStore);

      const card = {
        _id: 'abc',
        question: 'Question',
        answer: 'Answer',
      };
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          failedCardsLevel2: [card],
        },
      });

      const updatedCard = {
        ...card,
        question: 'Updated question',
      };
      cardStore.__triggerChange('card', {
        id: 'abc',
        doc: updatedCard,
      });

      expect(stateStore.actions).toContainEqual(updateReviewCard(updatedCard));
    });

    it('triggers an update when the current card is deleted', () => {
      subject(cardStore, stateStore);

      const card = {
        _id: 'abc',
        question: 'Question',
        answer: 'Answer',
      };
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          currentCard: card,
        },
      });

      const updatedCard = {
        ...card,
        question: 'Updated question',
      };
      cardStore.__triggerChange('card', {
        id: 'abc',
        deleted: true,
        doc: {
          ...updatedCard,
          deleted: true,
        },
      });

      expect(stateStore.actions).toContainEqual(
        expect.objectContaining({ type: 'DELETE_REVIEW_CARD', id: 'abc' })
      );
    });

    it('does NOT trigger an update when there is no change to the card', () => {
      subject(cardStore, stateStore);

      const card = {
        _id: 'abc',
        question: 'Question',
        answer: 'Answer',
      };
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          currentCard: card,
        },
      });

      cardStore.__triggerChange('card', {
        id: 'abc',
        doc: { ...card },
      });

      expect(stateStore.actions).not.toContainEqual(updateReviewCard(card));
    });

    it('does NOT trigger an update when an unrelated card is updated', () => {
      subject(cardStore, stateStore);

      const card = {
        _id: 'abc',
        question: 'Question',
        answer: 'Answer',
      };
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          currentCard: card,
        },
      });

      cardStore.__triggerChange('card', {
        id: 'xyz',
        doc: {
          ...card,
          _id: 'xyz',
        },
      });

      expect(stateStore.actions).not.toContainEqual(updateReviewCard(card));
    });

    it('does NOT trigger an update when an unrelated card is deleted', () => {
      subject(cardStore, stateStore);

      const card = {
        _id: 'abc',
        question: 'Question',
        answer: 'Answer',
      };
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          currentCard: card,
        },
      });

      cardStore.__triggerChange('card', {
        id: 'xyz',
        deleted: true,
        doc: {
          ...card,
          _id: 'xyz',
          deleted: true,
        },
      });

      expect(stateStore.actions).not.toContainEqual(
        expect.objectContaining({ type: 'DELETE_REVIEW_CARD', id: 'xyz' })
      );
    });
  });

  describe('review state', () => {
    it('triggers a sync when the review has changed', () => {
      subject(cardStore, stateStore);

      stateStore.__update({
        screen: 'review',
        review: initialState,
      });

      const review = {
        maxCards: 3,
        maxNewCards: 2,
        completed: 1,
        newCardsCompleted: 0,
        history: ['abc', 'def'],
        failedCardsLevel1: ['def'],
        failedCardsLevel2: [],
      };

      cardStore.__triggerChange('review', review);
      expect(stateStore.actions).toContainEqual(
        expect.objectContaining({ type: 'SYNC_REVIEW', review })
      );
    });

    it('does NOT trigger a sync when nothing has changed', () => {
      subject(cardStore, stateStore);

      stateStore.__update({
        screen: 'review',
        review: initialState,
      });
      const reviewSummary = getReviewSummary({
        review: initialState,
      });

      cardStore.__triggerChange('review', reviewSummary);
      expect(stateStore.actions).not.toContainEqual(
        expect.objectContaining({ type: 'SYNC_REVIEW', review: reviewSummary })
      );
    });

    it('cancels the review when the review is deleted', () => {
      subject(cardStore, stateStore);
      stateStore.__update({
        screen: 'review',
        review: {
          ...initialState,
          reviewState: ReviewState.QUESTION,
        },
      });

      cardStore.__triggerChange('review', null);

      expect(stateStore.actions).toContainEqual(
        expect.objectContaining({ type: 'CANCEL_REVIEW' })
      );
    });
  });
});
