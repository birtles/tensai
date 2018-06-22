import ReviewPhase from './ReviewPhase';
import { AvailableCards, Card } from '../model';
import { ReviewAction } from './actions';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface ReviewState {
  phase: symbol;

  // The time to use to update cards and calculating their next level etc.
  reviewTime: Date;

  // The maximum number of unique cards that will be presented to the user in
  // this review. The actual number presented may be less if there are
  // insufficient new and overdue cards.
  maxCards: number;

  // The maximum number of as-yet unreviewed cards that will be presented to the
  // user in this review.
  maxNewCards: number;

  // The number of cards that have been correctly answered and will not be
  // presented again in this review.
  completed: number;

  // The number of cards that *were* in the heap but are now in one of
  // the failed heaps or are the current card.
  newCardsInPlay: number;

  // Cards we have queued up but have yet to show to the user.
  heap: Card[];

  // Cards which we once failed but have since answered correctly once.
  failedCardsLevel1: Card[];

  // Cards which we have failed and have since yet to answer correctly.
  failedCardsLevel2: Card[];

  // An array of the cards we've presented to the user in order from most
  // to least recently seen. If a card has been shown more than once only the
  // most recent occurence is included. Note that the currentCard is not
  // included in the history.
  history: Card[];

  // The card currently being presented to the user. May be null if there is no
  // review in progress (or it is complete, or loading).
  currentCard: Card | null;

  // The next card to present if the current card.
  // May be null if there are no more cards to be reviewed or if there is no
  // review in progress.
  nextCard: Card | null;

  // An object describing the cards available for review.
  //
  // This is only ever set in the IDLE / COMPLETE states and even then it is not
  // always set.
  availableCards?: AvailableCards;

  // True if we are still saving the progress.
  // We use this to determine if it is ok to query the available cards or if we
  // should wait.
  savingProgress: boolean;

  // True if we are currently refreshing the set of available cards.
  loadingAvailableCards: boolean;
}

const initialState: ReviewState = {
  phase: ReviewPhase.IDLE,
  reviewTime: new Date(),
  maxCards: 0,
  maxNewCards: 0,
  completed: 0,
  newCardsInPlay: 0,
  heap: [],
  failedCardsLevel1: [],
  failedCardsLevel2: [],
  history: [],
  currentCard: null,
  nextCard: null,
  availableCards: undefined,
  savingProgress: false,
  loadingAvailableCards: false,
};

// When we update the current / next cards there are two modes:
const Update = {
  // Updates the current card with the next card before updating the next card.
  // If the current card is not null, it will be added to the history. This is
  // the normal mode used when reviewing.
  UpdateCurrentCard: Symbol('UpdateCurrentCard'),
  // Simply replaces the next card without modifying the current card. This is
  // the mode used when we re-load cards from the database.
  ReplaceNextCard: Symbol('ReplaceNextCard'),
};

export function review(
  state: ReviewState = initialState,
  action: ReviewAction
): ReviewState {
  switch (action.type) {
    case 'NEW_REVIEW': {
      return {
        ...initialState,
        phase: ReviewPhase.LOADING,
        reviewTime: state.reviewTime,
        maxCards: action.maxCards,
        maxNewCards: action.maxNewCards,
        availableCards: undefined,
      };
    }

    case 'SET_REVIEW_LIMIT': {
      return {
        ...state,
        phase: ReviewPhase.LOADING,
        maxCards: action.maxCards,
        maxNewCards: action.maxNewCards,
      };
    }

    case 'SET_REVIEW_TIME': {
      return {
        ...state,
        reviewTime: action.reviewTime,
      };
    }

    case 'REVIEW_LOADED': {
      // This should replace the next card regardless. The 'cards' included in
      // the action *includes* a card to be used for the next card since that
      // simplifies the case where the review limits are adjusted such that
      // there should no longer be a next card.
      let updatedState = {
        ...state,
        heap: action.cards,
      };

      // Fill in extra fields (only set when doing a sync)
      for (const field of [
        'history',
        'failedCardsLevel1',
        'failedCardsLevel2',
      ] as ('history' | 'failedCardsLevel1' | 'failedCardsLevel2')[]) {
        if (typeof action[field] !== 'undefined') {
          updatedState[field] = action[field]!;
        }
      }

      // Update the next card
      updatedState = updateNextCard(
        updatedState,
        action.nextCardSeed,
        Update.ReplaceNextCard
      );

      // When we first load, or after we have completed once, neither the next
      // card nor the current card will be filled-in so we will need to call
      // updateNextCard twice but this time we want to update the current card
      // too.
      if (updatedState.nextCard && !updatedState.currentCard) {
        updatedState = updateNextCard(
          updatedState,
          action.currentCardSeed,
          Update.UpdateCurrentCard
        );
      }

      // If we were complete but now have cards we need to go back to the
      // question state.
      if (
        (updatedState.phase === ReviewPhase.COMPLETE ||
          updatedState.phase === ReviewPhase.LOADING) &&
        updatedState.currentCard
      ) {
        updatedState.phase = ReviewPhase.QUESTION;
      }

      // If we are complete but this is the initial load, then it makes more
      // sense to show the user the idle state.
      if (updatedState.phase === ReviewPhase.COMPLETE && action.initialReview) {
        updatedState.phase = ReviewPhase.IDLE;
      }

      return updatedState;
    }

    case 'PASS_CARD': {
      if (
        state.phase !== ReviewPhase.ANSWER &&
        state.phase !== ReviewPhase.QUESTION
      ) {
        return state;
      }

      // We use passedCard to search arrays
      const passedCard = state.currentCard!;
      // But we push a copy of it that we will (probably) update
      const updatedCard = { ...passedCard };

      // Update failed queues
      let finished = true;
      let { failedCardsLevel1, failedCardsLevel2 } = state;
      let failedIndex = failedCardsLevel2.indexOf(passedCard);
      if (failedIndex !== -1) {
        // Move from queue two queue one
        failedCardsLevel2 = failedCardsLevel2.slice();
        failedCardsLevel2.splice(failedIndex, 1);
        failedCardsLevel1 = failedCardsLevel1.slice();
        failedCardsLevel1.push(updatedCard);
        finished = false;
      } else {
        failedIndex = failedCardsLevel1.indexOf(passedCard);
        if (failedIndex !== -1) {
          // Drop from queue one
          failedCardsLevel1 = failedCardsLevel1.slice();
          failedCardsLevel1.splice(failedIndex, 1);
        }
      }

      // Update the passed card
      if (finished) {
        if (updatedCard.progress.level && updatedCard.progress.reviewed) {
          const intervalInDays =
            (state.reviewTime.getTime() -
              updatedCard.progress.reviewed.getTime()) /
            MS_PER_DAY;
          updatedCard.progress.level = Math.max(
            intervalInDays * 2,
            updatedCard.progress.level,
            0.5
          );
        } else {
          // New / reset card: Review in a day
          updatedCard.progress.level = 0.5;
        }
        updatedCard.progress.reviewed = state.reviewTime;
      } else {
        // Sometimes it seems like we can end up with a card in one of the
        // failed queues without a progress of zero. It's not clear why this
        // happens: a sync where the chosen review record and progress record
        // don't match? In any case, to be sure, force the progress to zero
        // here.
        updatedCard.progress.level = 0;
      }
      const completed = finished ? state.completed + 1 : state.completed;

      // Add to end of history
      const history = state.history.slice();
      console.assert(
        history.indexOf(passedCard) === -1,
        'The current card should not be in the history'
      );
      history.push(updatedCard);

      const intermediateState = {
        ...state,
        phase: ReviewPhase.QUESTION,
        completed,
        failedCardsLevel2,
        failedCardsLevel1,
        history,
        currentCard: updatedCard,
        savingProgress: true,
      };

      return updateNextCard(
        intermediateState,
        action.nextCardSeed,
        Update.UpdateCurrentCard
      );
    }

    case 'SHOW_ANSWER': {
      if (state.phase !== ReviewPhase.QUESTION) {
        return state;
      }

      return {
        ...state,
        phase: ReviewPhase.ANSWER,
      };
    }

    case 'FAIL_CARD': {
      if (
        state.phase !== ReviewPhase.ANSWER &&
        state.phase !== ReviewPhase.QUESTION
      ) {
        return state;
      }

      // We use failedCard to search arrays
      const failedCard = state.currentCard!;
      // But we push a copy of it that we will (probably) update
      const updatedCard = { ...failedCard };

      // Update failed queues

      // Remove from queue one if it's there
      let { failedCardsLevel1 } = state;
      let failedIndex = failedCardsLevel1.indexOf(failedCard);
      if (failedIndex !== -1) {
        failedCardsLevel1 = failedCardsLevel1.slice();
        failedCardsLevel1.splice(failedIndex, 1);
      }

      // Append to queue 2 but remove it first if it's already there
      const failedCardsLevel2 = state.failedCardsLevel2.slice();
      // (If we already found it in queue one it won't be in queue two)
      if (failedIndex === -1) {
        failedIndex = failedCardsLevel2.indexOf(failedCard);
        if (failedIndex !== -1) {
          // It's not in level 2, so add it there
          failedCardsLevel2.splice(failedIndex, 1);
        }
      }
      failedCardsLevel2.push(updatedCard);

      // Update the failed card
      updatedCard.progress.level = 0;
      updatedCard.progress.reviewed = state.reviewTime;

      // Drop from history if it already exists then add to the end
      const history = state.history.slice();
      console.assert(
        history.indexOf(failedCard) === -1,
        'The current card should not be in the history'
      );
      history.push(updatedCard);

      const intermediateState = {
        ...state,
        phase: ReviewPhase.QUESTION,
        failedCardsLevel1,
        failedCardsLevel2,
        history,
        currentCard: updatedCard,
        savingProgress: true,
      };

      return updateNextCard(
        intermediateState,
        action.nextCardSeed,
        Update.UpdateCurrentCard
      );
    }

    case 'FINISH_UPDATE_PROGRESS': {
      if (!state.savingProgress) {
        return state;
      }

      return {
        ...state,
        savingProgress: false,
      };
    }

    case 'QUERY_AVAILABLE_CARDS': {
      return {
        ...state,
        loadingAvailableCards: true,
      };
    }

    case 'UPDATE_AVAILABLE_CARDS': {
      // If we're mid-review and we get a stray update to the available cards
      // we should be careful to clear availableCards so that when we actually
      // need them, we immediately fetch them.
      if (![ReviewPhase.IDLE, ReviewPhase.COMPLETE].includes(state.phase)) {
        return {
          ...state,
          availableCards: undefined,
          loadingAvailableCards: false,
        };
      }

      return {
        ...state,
        availableCards: action.availableCards,
        loadingAvailableCards: false,
      };
    }

    case 'UPDATE_REVIEW_CARD': {
      const update: Partial<ReviewState> = {};
      const fieldsWithCards: (keyof ReviewState)[] = [
        'currentCard',
        'nextCard',
        'heap',
        'failedCardsLevel1',
        'failedCardsLevel2',
        'history',
      ];
      const isArrayOfCards = (
        value: ReviewState[keyof ReviewState]
      ): value is Card[] => !!value && Array.isArray(value);
      const isCard = (value: ReviewState[keyof ReviewState]): value is Card =>
        !!value && typeof value === 'object' && value.hasOwnProperty('_id');

      for (const field of fieldsWithCards) {
        const value = state[field];

        if (isArrayOfCards(value)) {
          let found = false;
          const updatedArray = value.map(card => {
            if (card._id === action.card._id) {
              found = true;
              return action.card;
            }
            return card;
          });

          if (found) {
            update[field] = updatedArray;
          }
        } else if (isCard(value) && value._id === action.card._id) {
          update[field] = action.card;
        }
      }

      if (Object.keys(update).length === 0) {
        return state;
      }

      return {
        ...state,
        ...update,
      };
    }

    case 'DELETE_REVIEW_CARD': {
      const arrayFieldsWithCards: (
        | 'heap'
        | 'failedCardsLevel1'
        | 'failedCardsLevel2'
        | 'history')[] = [
        'heap',
        'failedCardsLevel1',
        'failedCardsLevel2',
        'history',
      ];
      const update: Partial<ReviewState> = {};
      for (const field of arrayFieldsWithCards) {
        if (!state[field]) {
          continue;
        }

        const index = state[field].findIndex(card => card._id === action.id);
        if (index === -1) {
          continue;
        }

        // We're currently assuming we only add cards once to any of these
        // arrays which I *think* is true.
        update[field] = state[field].slice();
        update[field]!.splice(index, 1);
      }

      if (state.nextCard && state.nextCard._id === action.id) {
        return updateNextCard(
          { ...state, ...update },
          action.nextCardSeed,
          Update.ReplaceNextCard
        );
      }

      if (state.currentCard && state.currentCard._id === action.id) {
        return updateNextCard(
          { ...state, ...update, currentCard: null },
          action.nextCardSeed,
          Update.UpdateCurrentCard
        );
      }

      if (Object.keys(update).length === 0) {
        return state;
      }

      return {
        ...state,
        ...update,
      };
    }

    case 'LOAD_REVIEW': {
      return {
        ...state,
        phase: ReviewPhase.LOADING,
        maxCards: action.review.maxCards,
        maxNewCards: action.review.maxNewCards,
        completed: action.review.completed,
        newCardsInPlay: action.review.newCardsCompleted,
        // We set the current card to null simply to reflect the fact that
        // newCardsInPlay will not count the current card if it was a new card.
        currentCard: null,
        nextCard: null,
      };
    }

    case 'CANCEL_REVIEW': {
      if (
        state.phase === ReviewPhase.IDLE ||
        state.phase === ReviewPhase.COMPLETE
      ) {
        return state;
      }

      return {
        ...state,
        phase: ReviewPhase.IDLE,
        maxCards: 0,
        maxNewCards: 0,
        completed: 0,
        newCardsInPlay: 0,
        heap: [],
        failedCardsLevel1: [],
        failedCardsLevel2: [],
        history: [],
        currentCard: null,
        nextCard: null,
      };
    }

    default:
      return state;
  }
}

// TODO: I'm sure I can factor this out better---perhaps into two methods? One
// for updating the current card and one for updating the next card?
// XXX Use an enum type for updateMode below
function updateNextCard(
  state: ReviewState,
  seed: number,
  updateMode: symbol
): ReviewState {
  // The fields we might update
  let { phase, currentCard, heap, history, newCardsInPlay } = state;
  let nextCard;

  let cardsAvailable =
    state.failedCardsLevel2.length +
    state.failedCardsLevel1.length +
    heap.length;
  if (!cardsAvailable) {
    if (updateMode === Update.UpdateCurrentCard || !currentCard) {
      phase = ReviewPhase.COMPLETE;
      currentCard = null;
      nextCard = null;
    } else {
      nextCard = null;
    }
  } else {
    // Update current card
    if (updateMode === Update.UpdateCurrentCard) {
      currentCard = state.nextCard;
      // Drop current card from heap
      const heapIndex = currentCard ? heap.indexOf(currentCard) : -1;
      if (heapIndex !== -1) {
        // TODO: Use an immutable-js List here
        heap = heap.slice();
        heap.splice(heapIndex, 1);
        cardsAvailable--;
        // If we found a level zero card that hasn't been reviewed in the heap
        // it's fair to say it's a new card.
        if (
          currentCard!.progress &&
          currentCard!.progress.level === 0 &&
          currentCard!.progress.reviewed === null
        ) {
          newCardsInPlay++;
        }
      }
    }

    // Find next card
    if (cardsAvailable) {
      let cardIndex = Math.floor(seed * cardsAvailable);
      const getCardAtIndex = (cardIndex: number) => {
        const level1Start = state.failedCardsLevel2.length;
        const heapStart =
          state.failedCardsLevel2.length + state.failedCardsLevel1.length;
        if (cardIndex < level1Start) {
          return state.failedCardsLevel2[cardIndex];
        } else if (cardIndex < heapStart) {
          return state.failedCardsLevel1[cardIndex - level1Start];
        }
        return heap[cardIndex - heapStart];
      };
      nextCard = getCardAtIndex(cardIndex);
      // If next card matches the current card then choose the next card, or
      // previous card if there is no next card.
      if (nextCard === currentCard) {
        if (cardsAvailable === 1) {
          nextCard = null;
        } else {
          cardIndex =
            cardIndex < cardsAvailable - 1 ? cardIndex + 1 : cardIndex - 1;
          nextCard = getCardAtIndex(cardIndex);
        }
      }
    } else {
      nextCard = null;
    }

    // If the current card went null, but we have a next card then we must have
    // just failed the last card and should revisit it.
    if (!currentCard && state.currentCard && nextCard) {
      currentCard = nextCard;
      nextCard = null;
    }

    // Drop current card from history: We need to do this after we've finalized
    // the current card.
    if (currentCard) {
      const historyIndex = history.indexOf(currentCard);
      if (historyIndex !== -1) {
        // TODO: Use an immutable-js List here
        history = history.slice();
        history.splice(historyIndex, 1);
      }
    }
  }

  return {
    ...state,
    phase,
    newCardsInPlay,
    heap,
    history,
    currentCard,
    nextCard,
  };
}

export default review;