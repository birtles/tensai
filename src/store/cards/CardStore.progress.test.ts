/* global afterEach, beforeEach, describe, expect, it */
/* eslint arrow-body-style: [ "off" ] */

import PouchDB from 'pouchdb';

import DataStore from '../DataStore';
import CardStore from './CardStore';
import { waitForEvents } from '../../../test/testcommon';

PouchDB.plugin(require('pouchdb-adapter-memory'));

const MS_PER_DAY = 1000 * 60 * 60 * 24;

describe('CardStore progress reporting', () => {
  let dataStore: DataStore;
  let subject: CardStore;
  let relativeTime: (diffInDays: number) => Date;

  beforeEach(() => {
    // Pre-fetching views seems to be a real bottle-neck when running tests
    dataStore = new DataStore({
      pouch: { adapter: 'memory' },
      prefetchViews: false,
    });
    subject = dataStore.cardStore;
    relativeTime = diffInDays =>
      new Date(dataStore.reviewTime.getTime() + diffInDays * MS_PER_DAY);
  });

  afterEach(() => dataStore.destroy());

  it('returns the progress when getting cards', async () => {
    await subject.putCard({ question: 'Question', answer: 'Answer' });
    const cards = await subject.getCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].progress.level).toBe(0);
    expect(cards[0].progress.reviewed).toBeNull();
  });

  it('returns the progress when getting a single card', async () => {
    const newCard = await subject.putCard({
      question: 'Question',
      answer: 'Answer',
    });
    const card = await subject.getCard(newCard._id);
    expect(card.progress).toMatchObject({
      level: 0,
      reviewed: null,
    });
  });

  it('returns the progress when getting cards by id', async () => {
    const card1 = await subject.putCard({
      question: 'Question 1',
      answer: 'Answer 1',
    });
    const card2 = await subject.putCard({
      question: 'Question 2',
      answer: 'Answer 2',
    });
    const cards = await subject.getCardsById([card1._id, card2._id]);
    expect(cards[0].progress).toMatchObject({
      level: 0,
      reviewed: null,
    });
    expect(cards[1].progress).toMatchObject({
      level: 0,
      reviewed: null,
    });
  });

  it('returns the progress when reporting added cards', async () => {
    let updateInfo;
    dataStore.changes.on('card', info => {
      updateInfo = info;
    });

    await subject.putCard({ question: 'Q1', answer: 'A1' });
    // Wait for a few rounds of events so the update can take place
    await waitForEvents(5);

    expect(updateInfo).toMatchObject({
      doc: {
        progress: {
          level: 0,
          reviewed: null,
        },
      },
    });
  });

  it('returns the progress when adding cards', async () => {
    const newCard = await subject.putCard({
      question: 'Question',
      answer: 'Answer',
    });
    expect(newCard).toMatchObject({
      progress: {
        level: 0,
        reviewed: null,
      },
    });
  });

  it('returns the progress when updating cards', async () => {
    const newCard = await subject.putCard({
      question: 'Question',
      answer: 'Answer',
    });
    const updatedCard = await subject.putCard({
      _id: newCard._id,
      question: 'Updated question',
    });
    expect(updatedCard.progress).toMatchObject({
      level: 0,
      reviewed: null,
    });
  });

  it('does not update the card modified time when only updating the progress', async () => {
    const newCard = await subject.putCard({
      question: 'Question',
      answer: 'Answer',
    });
    const updatedCard = await subject.putCard({
      _id: newCard._id,
      progress: { level: 1 },
    });
    expect(updatedCard.modified).toBe(newCard.modified);

    const fetchedCard = await subject.getCard(newCard._id);
    expect(fetchedCard.modified).toBe(newCard.modified);
  });

  it('allows resetting the progress', async () => {
    const newCard = await subject.putCard({
      question: 'Question',
      answer: 'Answer',
      progress: { reviewed: relativeTime(-1), level: 1 },
    });
    let fetchedCard = await subject.getCard(newCard._id);
    expect(fetchedCard.progress.level).toBe(1);

    await subject.putCard({ _id: newCard._id, progress: { level: 0 } });

    fetchedCard = await subject.getCard(newCard._id);
    expect(fetchedCard.progress.level).toBe(0);
  });

  it('allows updating the card contents and progress simultaneously', async () => {
    const newCard = await subject.putCard({
      question: 'Question',
      answer: 'Answer',
    });

    const updatedCard = await subject.putCard({
      _id: newCard._id,
      question: 'Updated question',
      progress: { level: 1, reviewed: relativeTime(-1) },
    });
    expect(updatedCard.question).toBe('Updated question');
    expect(updatedCard.progress.level).toBe(1);
    expect(updatedCard.progress.reviewed).toEqual(relativeTime(-1));
    expect(updatedCard.modified).not.toEqual(newCard.modified);

    const fetchedCard = await subject.getCard(newCard._id);
    expect(fetchedCard.question).toBe('Updated question');
    expect(fetchedCard.progress.level).toBe(1);
    expect(fetchedCard.progress.reviewed).toEqual(relativeTime(-1));
    expect(fetchedCard.modified).not.toEqual(newCard.modified);
  });

  it('allows setting the card contents and progress simultaneously', async () => {
    const newCard = await subject.putCard({
      question: 'Question',
      answer: 'Answer',
      progress: { level: 1, reviewed: relativeTime(-2) },
    });
    expect(newCard.progress.level).toBe(1);

    const fetchedCard = await subject.getCard(newCard._id);
    expect(fetchedCard.progress.level).toBe(1);
    expect(fetchedCard.progress.reviewed).toEqual(relativeTime(-2));
  });

  it('reports changes to the progress', async () => {
    const updates = [];
    dataStore.changes.on('card', info => {
      updates.push(info);
    });

    const card = await subject.putCard({ question: 'Q1', answer: 'A1' });
    await subject.putCard({
      _id: card._id,
      progress: { level: 1, reviewed: relativeTime(-3) },
    });

    // Wait for a few rounds of events so the update records can happen
    await waitForEvents(8);

    expect(updates).toHaveLength(2);
    expect(updates[1].doc.progress.level).toBe(1);
    expect(updates[1].doc.progress.reviewed).toEqual(relativeTime(-3));
    expect(updates[1].doc.question).toBe('Q1');
  });

  it('only reports once when a card and its progress are deleted', async () => {
    const updates = [];
    dataStore.changes.on('card', info => {
      updates.push(info);
    });

    const card = await subject.putCard({ question: 'Q1', answer: 'A1' });
    await subject.deleteCard(card._id);

    // Wait for a few rounds of events so the update records can happen
    await waitForEvents(8);

    expect(updates).toHaveLength(2);
    expect(updates[1].deleted).toBe(true);

    // Progress information won't be included because it's too difficult to look
    // up the latest revision and return it.
    expect(updates[1].doc.progress).toBe(undefined);
  });

  it('deletes the card when the corresponding progress record cannot be created', async () => {
    // Override ID generation so we can ensure there will be a conflicting
    // progress record.
    const originalGenerateCardId = CardStore.generateCardId;
    CardStore.generateCardId = () => 'abc';

    let testRemote;
    try {
      // Create a remote with a progress record that will conflict
      testRemote = new PouchDB('cards_remote', { adapter: 'memory' });
      await testRemote.put({ _id: 'progress-abc' });

      // Sync it to our subject
      let resolveIdle;
      const idlePromise = new Promise(resolve => {
        resolveIdle = resolve;
      });
      await dataStore.setSyncServer(testRemote, {
        onIdle: () => resolveIdle(),
      });
      await idlePromise;
      expect(await subject.hasProgressRecord('abc')).toBe(true);

      // Then try to create a card with an ID that will conflict
      await subject.putCard({ question: 'Question', answer: 'Answer' });
      expect(false).toBe(true);
    } catch (err) {
      // Should be a conflict error
      expect(err.status).toBe(409);
      try {
        await subject.getCard('abc');
        expect(false).toBe(true);
      } catch (err) {
        expect(err.status).toBe(404);
      }
    } finally {
      if (testRemote) {
        testRemote.destroy();
      }
      CardStore.generateCardId = originalGenerateCardId;
    }
  });

  it('deletes the corresponding progress record when deleting a card', async () => {
    const card = await subject.putCard({
      question: 'Question',
      answer: 'Answer',
    });
    await subject.deleteCard(card._id);

    expect(await subject.hasProgressRecord(card._id)).toBe(false);
  });

  it('deletes the corresponding progress record when deleting a card by ID', async () => {
    const card = await subject.putCard({
      question: 'Question',
      answer: 'Answer',
    });
    await subject.deleteCard(card._id);

    expect(await subject.hasProgressRecord(card._id)).toBe(false);
  });

  async function addCards(num) {
    const cards = new Array(num);
    for (let i = 0; i < cards.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      cards[i] = await subject.putCard({
        question: `Question ${i + 1}`,
        answer: `Answer ${i + 1}`,
      });
    }
    return cards;
  }

  it('returns cards based on their overdueness', async () => {
    // First add a bunch of cards
    const cards = await addCards(5);

    // Set their progress somewhat randomly so we can test the sorting of the
    // result.
    //
    // Card 1: Not *quite* overdue yet
    await subject.putCard({
      _id: cards[0]._id,
      progress: { reviewed: relativeTime(-1.9), level: 2 },
    });
    // Card 2: Very overdue
    await subject.putCard({
      _id: cards[1]._id,
      progress: { reviewed: relativeTime(-200), level: 20 },
    });
    // Card 3: Just overdue
    await subject.putCard({
      _id: cards[2]._id,
      progress: { reviewed: relativeTime(-2.1), level: 2 },
    });
    // Card 4: Precisely overdue to the second
    await subject.putCard({
      _id: cards[3]._id,
      progress: { reviewed: relativeTime(-1), level: 1 },
    });
    // Card 5: Somewhat overdue
    await subject.putCard({
      _id: cards[4]._id,
      progress: { reviewed: relativeTime(-12), level: 8 },
    });

    // Given, the above we'd expect the result to be:
    //
    //     [ Card 2, Card 5, Card 3, Card 4 ]
    const result = await subject.getCards({ type: 'overdue' });
    expect(result).toHaveLength(4);
    expect(result[0].question).toBe('Question 2');
    expect(result[1].question).toBe('Question 5');
    expect(result[2].question).toBe('Question 3');
    expect(result[3].question).toBe('Question 4');

    // Check that the the availability API matches
    expect(await subject.getAvailableCards()).toMatchObject({
      newCards: 0,
      overdueCards: 4,
    });
  });

  it('respects the limit set when returning overdue cards', async () => {
    // Add cards
    const cards = await addCards(4);

    // Make the cards progressively overdue.
    const reviewed = new Date(dataStore.reviewTime.getTime() - 3 * MS_PER_DAY);
    for (const card of cards) {
      reviewed.setTime(reviewed.getTime() - MS_PER_DAY);
      // eslint-disable-next-line no-await-in-loop
      await subject.putCard({
        _id: card._id,
        progress: { reviewed, level: 3 },
      });
    }

    const result = await subject.getCards({ type: 'overdue', limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].question).toBe('Question 4');
    expect(result[1].question).toBe('Question 3');
  });

  it('sorts failed cards first', async () => {
    const cards = await addCards(3);

    // Card 1: Just overdue
    await subject.putCard({
      _id: cards[0]._id,
      progress: { reviewed: relativeTime(-2.1), level: 2 },
    });
    // Card 2: Failed (and overdue)
    await subject.putCard({
      _id: cards[1]._id,
      progress: { reviewed: relativeTime(-2.1), level: 0 },
    });
    // Card 3: Just overdue
    await subject.putCard({
      _id: cards[2]._id,
      progress: { reviewed: relativeTime(-2.1), level: 2 },
    });

    const result = await subject.getCards({ type: 'overdue' });
    expect(result).toHaveLength(3);
    expect(result[0].question).toBe('Question 2');
    expect(result[1].question).toBe('Question 3');
    expect(result[2].question).toBe('Question 1');
  });

  it('allows skipping failed cards', async () => {
    const cards = await addCards(3);

    // Card 1: Just overdue
    await subject.putCard({
      _id: cards[0]._id,
      progress: { reviewed: relativeTime(-2.1), level: 2 },
    });
    // Card 2: Failed (and overdue)
    await subject.putCard({
      _id: cards[1]._id,
      progress: { reviewed: relativeTime(-2.1), level: 0 },
    });
    // Card 3: Just overdue
    await subject.putCard({
      _id: cards[2]._id,
      progress: { reviewed: relativeTime(-2.1), level: 2 },
    });

    const result = await subject.getCards({
      type: 'overdue',
      skipFailedCards: true,
    });
    expect(result).toHaveLength(2);
    expect(result[0].question).toBe('Question 3');
    expect(result[1].question).toBe('Question 1');
  });

  it('allows the review time to be updated', async () => {
    const cards = await addCards(3);

    // Card 1: Level now: -1, in 10 days' time: 9
    await subject.putCard({
      _id: cards[0]._id,
      progress: { reviewed: dataStore.reviewTime, level: 1 },
    });
    // Card 2: Level now: 0.2, in 10 days' time: 10.2
    await subject.putCard({
      _id: cards[1]._id,
      progress: { reviewed: relativeTime(-1.2), level: 1 },
    });
    // Card 3: Level now: 0.333, in 10 days' time: 0.666
    await subject.putCard({
      _id: cards[2]._id,
      progress: { reviewed: relativeTime(-40), level: 30 },
    });

    // Initially only cards 3 and 2 are due, and in that order ...
    let result = await subject.getCards({ type: 'overdue' });
    expect(result).toHaveLength(2);
    expect(result[0].question).toBe('Question 3');
    expect(result[1].question).toBe('Question 2');

    // ... but in 10 days' time ...
    await subject.updateReviewTime(relativeTime(10));

    // ... we should get card 2, card 1, card 3
    result = await subject.getCards({ type: 'overdue' });
    expect(result).toHaveLength(3);
    expect(result[0].question).toBe('Question 2');
    expect(result[1].question).toBe('Question 1');
    expect(result[2].question).toBe('Question 3');

    // Check availability API matches
    expect(await subject.getAvailableCards()).toMatchObject({
      newCards: 0,
      overdueCards: 3,
    });
  });

  it('returns new cards, oldest first', async () => {
    // Create some cards with creation time spaced out
    const waitASec = () =>
      new Promise(resolve => {
        setTimeout(resolve, 1);
      });
    const cards = new Array(3);
    for (let i = 0; i < cards.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      cards[i] = await subject.putCard({
        question: `Question ${i + 1}`,
        answer: `Answer ${i + 1}`,
      });
      // eslint-disable-next-line no-await-in-loop
      await waitASec();
    }

    const result = await subject.getCards({ type: 'new' });
    expect(result).toHaveLength(3);
    expect(result[0].question).toBe('Question 3');
    expect(result[1].question).toBe('Question 2');
    expect(result[2].question).toBe('Question 1');

    // Check availability API matches
    expect(await subject.getAvailableCards()).toMatchObject({
      newCards: 3,
      overdueCards: 0,
    });
  });

  it('drops deleted cards from the new card count', async () => {
    const card = await subject.putCard({
      question: 'Question',
      answer: 'Answer',
    });
    expect(await subject.getAvailableCards()).toMatchObject({
      newCards: 1,
      overdueCards: 0,
    });

    await subject.deleteCard(card._id);
    expect(await subject.getAvailableCards()).toMatchObject({
      newCards: 0,
      overdueCards: 0,
    });
  });

  it('returns the review progress along with overdue cards', async () => {
    const cards = await addCards(2);

    await subject.putCard({
      _id: cards[0]._id,
      progress: { reviewed: relativeTime(-1), level: 1 },
    });
    await subject.putCard({
      _id: cards[1]._id,
      progress: { reviewed: relativeTime(-4), level: 2 },
    });

    const result = await subject.getCards({ type: 'overdue' });
    expect(result).toHaveLength(2);
    expect(result[0].question).toBe('Question 2');
    expect(result[0].progress.level).toBe(2);
    expect(result[0].progress.reviewed).toEqual(relativeTime(-4));
    expect(result[1].question).toBe('Question 1');
    expect(result[1].progress.level).toBe(1);
    expect(result[1].progress.reviewed).toEqual(relativeTime(-1));
  });

  it('returns the review progress along with new cards', async () => {
    await addCards(2);

    const result = await subject.getCards({ type: 'new' });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      question: 'Question 2',
      progress: {
        level: 0,
        reviewed: null,
      },
    });
    expect(result[1]).toMatchObject({
      question: 'Question 1',
      progress: {
        level: 0,
        reviewed: null,
      },
    });
  });
});