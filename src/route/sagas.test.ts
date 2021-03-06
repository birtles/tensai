/**
 * @jest-environment node
 *
 * Jest randomly injects jsdom which makes it impossible to mock history.
 * It also doesn't make it possible to select a "none" environment.
 * It also requires that this directive be the very first comment in the file.
 * It also has absolutely woeful documentation.
 * That is all.
 */

import { expectSaga } from 'redux-saga-test-plan';
import * as matchers from 'redux-saga-test-plan/matchers';

import {
  followLink as followLinkSaga,
  beforeScreenChange as beforeScreenChangeSaga,
} from './sagas';
import { FormState } from '../edit/FormState';
import * as Actions from '../actions';
import { reducer } from '../reducer';

declare global {
  namespace NodeJS {
    interface Global {
      history: {
        pushState: (data: any, title: string, url?: string) => void;
        replaceState: (data: any, title: string, url?: string) => void;
        back: () => void;
      };
    }
  }
}

const initialState = reducer(undefined, { type: 'none' } as any);

describe('sagas:route followLink', () => {
  beforeEach(() => {
    global.history = {
      pushState: () => {},
      replaceState: () => {},
      back: () => {},
    };
  });

  it('does forwards navigation when direction is forwards', () => {
    return expectSaga(followLinkSaga, Actions.followLink('/', 'forwards'))
      .withState(initialState)
      .provide([[matchers.call.fn(beforeScreenChangeSaga), {}]])
      .call([history, 'pushState'], { index: 0 }, '', '/')
      .put(Actions.navigate({ url: '/' }))
      .run();
  });

  it('does forwards navigation when direction is not specified', () => {
    return expectSaga(followLinkSaga, Actions.followLink('/'))
      .withState(initialState)
      .provide([[matchers.call.fn(beforeScreenChangeSaga), {}]])
      .call([history, 'pushState'], { index: 0 }, '', '/')
      .put(Actions.navigate({ url: '/' }))
      .run();
  });

  it(
    'does forwards navigation when direction is replace but there is no' +
      ' history',
    () => {
      return expectSaga(followLinkSaga, Actions.followLink('/', 'replace'))
        .withState(initialState)
        .provide([[matchers.call.fn(beforeScreenChangeSaga), {}]])
        .call([history, 'pushState'], { index: 0 }, '', '/')
        .put(Actions.navigate({ url: '/' }))
        .run();
    }
  );

  it('does replace navigation when direction is replace', () => {
    return expectSaga(
      followLinkSaga,
      Actions.followLink('/?abc=123', 'replace')
    )
      .withState({ route: { index: 0, history: [{ screen: '/' }] } })
      .call([history, 'replaceState'], { index: 0 }, '', '/?abc=123')
      .put(Actions.navigate({ url: '/?abc=123', replace: true }))
      .run();
  });

  it('calls history.back() when the direction is backwards and history matches', () => {
    return expectSaga(followLinkSaga, Actions.followLink('/#abc', 'backwards'))
      .withState({
        route: {
          index: 1,
          history: [
            { screen: '', fragment: 'abc' },
            { screen: '', fragment: 'def' },
          ],
        },
      })
      .call([history, 'back'])
      .run();
  });

  it(
    'puts a navigate action when direction is backwards but history' +
      ' does not match because screen does not match',
    () => {
      return expectSaga(
        followLinkSaga,
        Actions.followLink('/settings', 'backwards')
      )
        .withState({
          route: {
            index: 1,
            history: [{ screen: '' }, { screen: '' }],
          },
        })
        .call([history, 'pushState'], { index: 2 }, '', '/settings')
        .put(Actions.navigate({ url: '/settings' }))
        .run();
    }
  );

  it(
    'puts a navigate action when direction is backwards but history' +
      ' does not match because query string does not match',
    () => {
      return expectSaga(
        followLinkSaga,
        Actions.followLink('/?abc=123', 'backwards')
      )
        .withState({
          route: {
            index: 1,
            history: [
              {
                screen: '',
                search: { a: '123', b: '456' },
              },
              { screen: '' },
            ],
          },
        })
        .call([history, 'pushState'], { index: 2 }, '', '/?abc=123')
        .put(Actions.navigate({ url: '/?abc=123' }))
        .run();
    }
  );

  it(
    'puts a navigate action when direction is backwards but history' +
      ' does not match because fragment does not match',
    () => {
      return expectSaga(
        followLinkSaga,
        Actions.followLink('/#ghi', 'backwards')
      )
        .withState({
          route: {
            index: 1,
            history: [
              { screen: '', fragment: 'abc' },
              { screen: '', fragment: 'def' },
            ],
          },
        })
        .call([history, 'pushState'], { index: 2 }, '', '/#ghi')
        .put(Actions.navigate({ url: '/#ghi' }))
        .run();
    }
  );

  it(
    'puts a navigate action when direction is backwards but history' +
      ' does not match because it is empty',
    () => {
      return expectSaga(
        followLinkSaga,
        Actions.followLink('/#abc', 'backwards')
      )
        .withState(initialState)
        .provide([[matchers.call.fn(beforeScreenChangeSaga), {}]])
        .call([history, 'pushState'], { index: 0 }, '', '/#abc')
        .put(Actions.navigate({ url: '/#abc' }))
        .run();
    }
  );

  it('does nothing if the URL matches the current route and link is not active', () => {
    return expectSaga(followLinkSaga, Actions.followLink('/#def', 'forwards'))
      .withState({
        route: {
          index: 1,
          history: [
            { screen: '', fragment: 'abc' },
            { screen: '', fragment: 'def' },
          ],
        },
      })
      .not.call([history, 'back'])
      .not.call([history, 'pushState'], { index: 2 }, '', '/#def')
      .not.put(Actions.navigate({ url: '/#def' }))
      .run();
  });

  it('navigates if the URL matches the current route and link IS active', () => {
    return expectSaga(
      followLinkSaga,
      Actions.followLink('/#def', 'forwards', true)
    )
      .withState({
        route: {
          index: 1,
          history: [
            { screen: '', fragment: 'abc' },
            { screen: '', fragment: 'def' },
          ],
        },
      })
      .call([history, 'pushState'], { index: 2 }, '', '/#def')
      .put(Actions.navigate({ url: '/#def' }))
      .run();
  });
});

describe('sagas:route beforeScreenChange', () => {
  it('returns false if the screen-specific action does', () => {
    const formId = 5;
    const state = {
      edit: {
        forms: {
          active: {
            formId,
            formState: FormState.Ok,
            dirtyFields: new Set(['answer']),
            notes: [],
          },
        },
      },
      route: {
        index: 0,
        history: [{ screen: 'edit-card' }],
      },
    };
    const error = { name: 'bad', message: 'too bad' };

    return expectSaga(beforeScreenChangeSaga)
      .withState(state)
      .put(Actions.saveCard(formId))
      .dispatch(Actions.failSaveCard(formId, error))
      .returns(false)
      .run();
  });

  it(
    'returns false if there is a navigation while the actions are' +
      ' happening',
    () => {
      const formId = 5;
      const state = {
        edit: {
          forms: {
            active: {
              formId,
              formState: FormState.Ok,
              dirtyFields: new Set(['answer']),
              notes: [],
            },
          },
        },
        route: {
          index: 0,
          history: [{ screen: 'edit-card' }],
        },
      };

      return expectSaga(beforeScreenChangeSaga)
        .withState(state)
        .put(Actions.saveCard(formId))
        .dispatch(Actions.navigate({ url: '/' }))
        .returns(false)
        .run();
    }
  );
});
