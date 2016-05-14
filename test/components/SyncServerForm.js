/* global define, it, describe */

import React from 'react';
import { shallow } from 'enzyme';
import { assert } from 'chai';
import sinon from 'sinon';
import SyncServerForm from '../../src/components/SyncServerForm';

sinon.assert.expose(assert, { prefix: '' });

describe('<SyncServerForm />', () => {
  const stub = sinon.stub();

  it('uses the supplied server name', () => {
    const subject =
      shallow(<SyncServerForm server="abc" onSubmit={stub} onCancel={stub} />);

    assert.strictEqual(subject.find('input[name="server"]').prop('value'),
                       'abc');
  });

  it('allows the server name to be overwritten', () => {
    const subject =
      shallow(<SyncServerForm server="abc" onSubmit={stub} onCancel={stub} />);

    subject.find('input[name="server"]').simulate('change',
      { target: { value: 'def' } });

    assert.strictEqual(subject.find('input[name="server"]').prop('value'),
                       'def');
  });

  it('resets the entered text when the server name is updated', () => {
    const subject =
      shallow(<SyncServerForm server="abc" onSubmit={stub} onCancel={stub} />);

    subject.find('input[name="server"]').simulate('change',
      { target: { value: 'def' } });
    subject.setProps({ server: 'ghi' });

    assert.strictEqual(subject.find('input[name="server"]').prop('value'),
                       'ghi');
  });
});
