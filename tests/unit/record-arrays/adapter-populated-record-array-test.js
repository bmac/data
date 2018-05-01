import { A } from '@ember/array';
import RSVP from 'rsvp';
import { run } from '@ember/runloop';
import DS from 'ember-data';

import { module, test } from 'qunit';
const { AdapterPopulatedRecordArray } = DS;

module('unit/record-arrays/adapter-populated-record-array - DS.AdapterPopulatedRecordArray');

function internalModelFor(record) {
  let _internalModel = {
    get id() {
      return record.id;
    },
    getRecord() {
      return record;
    }
  };

  record._internalModel = _internalModel
  return _internalModel;
}

test('default initial state', function(assert) {
  let recordArray = AdapterPopulatedRecordArray.create({ modelName: 'recordType' });

  assert.equal(recordArray.get('isLoaded'), false, 'expected isLoaded to be false');
  assert.equal(recordArray.get('modelName'), 'recordType');
  assert.deepEqual(recordArray.get('content'), []);
  assert.strictEqual(recordArray.get('query'), null);
  assert.strictEqual(recordArray.get('store'), null);
  assert.strictEqual(recordArray.get('links'), null);
});

test('custom initial state', function(assert) {
  let content = A([]);
  let store = {};
  let recordArray = AdapterPopulatedRecordArray.create({
    modelName: 'apple',
    isLoaded: true,
    isUpdating: true,
    content,
    store,
    query: 'some-query',
    links: 'foo'
  });
  assert.equal(recordArray.get('isLoaded'), true);
  assert.equal(recordArray.get('isUpdating'), false);
  assert.equal(recordArray.get('modelName'), 'apple');
  assert.equal(recordArray.get('content'), content);
  assert.equal(recordArray.get('store'), store);
  assert.equal(recordArray.get('query'), 'some-query');
  assert.strictEqual(recordArray.get('links'), 'foo');
});

test('#replace() throws error', function(assert) {
  let recordArray = AdapterPopulatedRecordArray.create({ modelName: 'recordType' });

  assert.throws(() => {
    recordArray.replace();
  }, Error('The result of a server query (on recordType) is immutable.'), 'throws error');
});

test('#update uses _update enabling query specific behavior', function(assert) {
  let queryCalled = 0;
  let deferred = RSVP.defer();

  const store = {
    _query(modelName, query, array) {
      queryCalled++;
      assert.equal(modelName, 'recordType');
      assert.equal(query, 'some-query');
      assert.equal(array, recordArray);

      return deferred.promise;
    }
  };

  let recordArray = AdapterPopulatedRecordArray.create({
    modelName: 'recordType',
    store,
    query: 'some-query'
  });

  assert.equal(recordArray.get('isUpdating'), false, 'should not yet be updating');

  assert.equal(queryCalled, 0);

  let updateResult = recordArray.update();

  assert.equal(queryCalled, 1);

  deferred.resolve('return value');

  assert.equal(recordArray.get('isUpdating'), true, 'should be updating');

  return updateResult.then(result => {
    assert.equal(result, 'return value');
    assert.equal(recordArray.get('isUpdating'), false, 'should no longer be updating');
  });
});

// TODO: is this method required, i suspect store._query should be refactor so this is not needed
test('#_setInternalModels', function(assert) {
  let didAddRecord = 0;
  function add(array) {
    didAddRecord++;
    assert.equal(array, recordArray);
  }

  let recordArray = AdapterPopulatedRecordArray.create({
    query: 'some-query'
  });

  let model1 = internalModelFor({ id: 1 });
  let model2 = internalModelFor({ id: 2 });

  model1._recordArrays = { add };
  model2._recordArrays = { add };

  assert.equal(didAddRecord, 0, 'no records should have been added yet');

  let links = { foo: 1 };
  let meta = { bar: 2 };

  run(() => {
    assert.equal(recordArray._setInternalModels([model1, model2], {
      links,
      meta
    }), undefined, '_setInternalModels should have no return value');

    assert.equal(didAddRecord, 2, 'two records should have been added');

    assert.deepEqual(recordArray.toArray(), [
      model1,
      model2
    ].map(x => x.getRecord()), 'should now contain the loaded records');

    assert.equal(recordArray.get('links').foo, 1);
    assert.equal(recordArray.get('meta').bar, 2);
  });
});
