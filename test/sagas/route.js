/* global beforeEach, describe, it */
/* eslint arrow-body-style: [ 'off' ] */

import { expectSaga } from 'redux-saga-test-plan';
import { followLink as followLinkSaga,
         insertHistory as insertHistorySaga } from '../../src/sagas/route';

const followLink = (direction, url) => ({
  type: 'FOLLOW_LINK',
  direction,
  url: url || '/'
});

describe('sagas:route followLink', () => {
  beforeEach('setup global', () => {
    global.history = {
      pushState: () => {},
      replaceState: () => {},
      back: () => {}
    };
  });

  it('does forwards navigation when direction is forwards', () => {
    return expectSaga(followLinkSaga, followLink('forwards'))
      .call([ history, 'pushState' ], { index: 0 }, '', '/')
      .put({ type: 'NAVIGATE', url: '/' })
      .run();
  });

  it('does forwards navigation when direction is not specified', () => {
    return expectSaga(followLinkSaga, followLink())
      .call([ history, 'pushState' ], { index: 0 }, '', '/')
      .put({ type: 'NAVIGATE', url: '/' })
      .run();
  });

  it('does forwards navigation when direction is replace but there is no' +
     ' history',
    () => {
      return expectSaga(followLinkSaga, followLink('replace'))
        .call([ history, 'pushState' ], { index: 0 }, '', '/')
        .put({ type: 'NAVIGATE', url: '/' })
        .run();
    }
  );

  it('does replace navigation when direction is replace', () => {
    return expectSaga(followLinkSaga, followLink('replace', '/?abc=123'))
      .withState({ route: { index: 0, history: [ { screen: '/' } ] } })
      .call([ history, 'replaceState' ], { index: 0 }, '', '/?abc=123')
      .put({ type: 'NAVIGATE', replace: true, url: '/?abc=123' })
      .run();
  });

  it('calls history.back() when the direction is backwards and history matches',
  () => {
    return expectSaga(followLinkSaga, followLink('backwards', '/#abc'))
      .withState({
        route: {
          index: 1,
          history: [
            { screen: '', fragment: 'abc' },
            { screen: '', fragment: 'def' }
          ]
        }
      })
      .call([ history, 'back' ])
      .run();
  });

  it('puts a NAVIGATE action when direction is backwards but history' +
     ' does not match because screen does not match',
    () => {
      return expectSaga(followLinkSaga, followLink('backwards', '/settings'))
        .withState({
          route: {
            index: 1,
            history: [ { screen: '' }, { screen: '' } ]
          }
        })
        .call([ history, 'pushState' ], { index: 2 }, '', '/settings')
        .put({ type: 'NAVIGATE', url: '/settings' })
        .run();
    }
  );

  it('puts a NAVIGATE action when direction is backwards but history' +
     ' does not match because query string does not match',
    () => {
      return expectSaga(followLinkSaga, followLink('backwards', '/?abc=123'))
        .withState({
          route: {
            index: 1,
            history: [
              {
                screen: '',
                search: { a: '123', b: '456' }
              },
              { screen: '' }
            ]
          }
        })
        .call([ history, 'pushState' ], { index: 2 }, '', '/?abc=123')
        .put({ type: 'NAVIGATE', url: '/?abc=123' })
        .run();
    }
  );

  it('puts a NAVIGATE action when direction is backwards but history' +
     ' does not match because fragment does not match',
    () => {
      return expectSaga(followLinkSaga, followLink('backwards', '/#ghi'))
        .withState({
          route: {
            index: 1,
            history: [
              { screen: '', fragment: 'abc' },
              { screen: '', fragment: 'def' }
            ]
          }
        })
        .call([ history, 'pushState' ], { index: 2 }, '', '/#ghi')
        .put({ type: 'NAVIGATE', url: '/#ghi' })
        .run();
    }
  );

  it('puts a NAVIGATE action when direction is backwards but history' +
     ' does not match because it is empty',
    () => {
      return expectSaga(followLinkSaga, followLink('backwards', '/#abc'))
        .call([ history, 'pushState' ], { index: 0 }, '', '/#abc')
        .put({ type: 'NAVIGATE', url: '/#abc' })
        .run();
    }
  );

  it('does nothing if the URL matches the current route and direction is' +
     ' backwards',
    () => {
      return expectSaga(followLinkSaga, followLink('backwards', '/#def'))
        .withState({
          route: {
            index: 1,
            history: [
              { screen: '', fragment: 'abc' },
              { screen: '', fragment: 'def' }
            ]
          }
        })
        .not.call([ history, 'back' ])
        .not.call([ history, 'pushState' ], { index: 2 }, '', '/#def')
        .not.put({ type: 'NAVIGATE', url: '/#def' })
        .run();
    }
  );

  it('does nothing if the URL matches the current route and direction is' +
     ' replace',
    () => {
      return expectSaga(followLinkSaga, followLink('replace', '/#abc'))
        .withState({
          route: {
            index: 0,
            history: [ { screen: '', fragment: 'abc' } ]
          }
        })
        .not.call([ history, 'replaceState' ], { index: 0 }, '', '/#abc')
        .not.put({ type: 'NAVIGATE', url: '/#abc' })
        .run();
    }
  );

  it('does nothing if the URL matches the current route and direction is' +
     ' forwards',
    () => {
      return expectSaga(followLinkSaga, followLink('forwards', '/#abc'))
        .withState({
          route: {
            index: 0,
            history: [ { screen: '', fragment: 'abc' } ]
          }
        })
        .not.call([ history, 'pushState' ], { index: 1 }, '', '/#abc')
        .not.put({ type: 'NAVIGATE', url: '/#abc' })
        .run();
    }
  );
});

const insertHistory = url => ({ type: 'INSERT_HISTORY', url });

describe('sagas:route insertHistory', () => {
  beforeEach('setup global', () => {
    global.history = {
      pushState: () => {},
      replaceState: () => {},
      back: () => {}
    };
  });

  it('adds history item', () => {
    return expectSaga(insertHistorySaga, insertHistory('/cards/1234'))
      .withState({ route: { index: 0, history: [ { screen: 'edit-card' } ] } })
      .call([ history, 'replaceState' ], { index: 0 }, '', '/cards/1234')
      .call([ history, 'pushState' ], { index: 1 }, '', '/cards/new')
      .run();
  });

  it('does nothing when there is no current route', () => {
    return expectSaga(insertHistorySaga, insertHistory('/cards/1234'))
      .not.call([ history, 'replaceState' ], { index: 0 }, '', '/cards/1234')
      .run();
  });
});
