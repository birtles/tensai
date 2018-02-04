import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects';
import * as reviewActions from './actions';
import { getReviewSummary } from './selectors';
import ReviewState from './states';

// Sagas

export function* updateHeap(cardStore, action) {
  const reviewInfo = yield select(state => (state ? state.review : {}));

  // Don't update if we're idle. This can happen if we catch a SET_REVIEW_TIME
  // action.
  if (reviewInfo.reviewState === ReviewState.IDLE) {
    return;
  }

  let freeSlots = Math.max(
    0,
    reviewInfo.maxCards -
      reviewInfo.completed -
      reviewInfo.failedCardsLevel1.length -
      reviewInfo.failedCardsLevel2.length -
      (reviewInfo.currentCard ? 1 : 0)
  );
  // Note that we ignore 'nextCard' above since we assume that the reducer that
  // handles REVIEW_LOADED will update nextCard so we need to include it in the
  // set of cards we provide.

  // TODO: Error handling for the below

  // First fill up with the maximum number of new cards
  const newCardSlots = Math.max(
    Math.min(reviewInfo.maxNewCards - reviewInfo.newCardsInPlay, freeSlots),
    0
  );
  let cards = [];
  if (newCardSlots) {
    cards = yield call([cardStore, 'getCards'], {
      limit: newCardSlots,
      type: 'new',
    });
    freeSlots -= cards.length;
  }

  // Now fill up the overdue slots
  if (freeSlots) {
    const options = { type: 'overdue', limit: freeSlots };
    // If we are updating the heap mid-review then avoid getting cards that
    // are already in our failed heaps.
    if (
      action.type === 'SET_REVIEW_LIMIT' ||
      action.type === 'SET_REVIEW_TIME'
    ) {
      options.skipFailedCards = true;
    }
    cards.push(...(yield call([cardStore, 'getCards'], options)));
  }

  yield put(reviewActions.reviewLoaded(cards));

  try {
    yield call([cardStore, 'putReview'], yield select(getReviewSummary));
  } catch (error) {
    // Do we really care?
  }
}

export function* updateProgress(cardStore, action) {
  const reviewInfo = yield select(state => (state ? state.review : {}));

  // Fetch the updated card from the state. Normally this is the last card in
  // the history, unless we happen to choose the same card twice which should
  // only happen when it is the last card and we failed it.
  //
  // As a result, when we detect that we have the last card if the action was
  // a failure, then we must assume we failed that last card so we should update
  // *that* card instead of the last card in the history.
  const isLastCard = reviewInfo.nextCard === null;
  let card;
  if (isLastCard && action.type === 'FAIL_CARD') {
    card = reviewInfo.currentCard;
  } else {
    card = reviewInfo.history[reviewInfo.history.length - 1];
  }

  const update = {
    _id: card._id,
    progress: card.progress,
  };

  try {
    yield call([cardStore, 'putCard'], update);
    yield put(reviewActions.finishUpdateProgress());
  } catch (error) {
    console.error(`Failed to update progress of card: ${error}`);
    // TODO: Define the following action
    // yield put(reviewActions.failUpdateProgress(error));
    // For now just pretend it worked:
    yield put(reviewActions.finishUpdateProgress());
  }

  try {
    yield call([cardStore, 'putReview'], yield select(getReviewSummary));
  } catch (error) {
    // Do we really care?
  }
}

export function* updateReviewTime(cardStore, action) {
  yield call([cardStore, 'setReviewTime'], action.reviewTime);
}

export function* queryAvailableCards(cardStore) {
  // TODO: Error handling
  const availableCards = yield call([cardStore, 'getAvailableCards']);
  yield put(reviewActions.updateAvailableCards(availableCards));
}

function* reviewSagas(cardStore) {
  yield* [
    takeEvery(
      ['NEW_REVIEW', 'SET_REVIEW_LIMITS', 'SET_REVIEW_TIME'],
      updateHeap,
      cardStore
    ),
    takeEvery(['PASS_CARD', 'FAIL_CARD'], updateProgress, cardStore),
    takeEvery(['SET_REVIEW_TIME'], updateReviewTime, cardStore),
    takeLatest(['QUERY_AVAILABLE_CARDS'], queryAvailableCards, cardStore),
  ];
}

export default reviewSagas;
