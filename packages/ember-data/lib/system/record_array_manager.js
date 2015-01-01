/**
  @module ember-data
*/

import {
  RecordArray,
  FilteredRecordArray,
  AdapterPopulatedRecordArray
} from "ember-data/system/record_arrays";
import {
  MapWithDefault,
  OrderedSet
} from "ember-data/system/map";
var get = Ember.get;
var forEach = Ember.EnumerableUtils.forEach;
var indexOf = Ember.EnumerableUtils.indexOf;
var guidFor = Ember.guidFor;

/**
  @class RecordArrayManager
  @namespace DS
  @private
  @extends Ember.Object
*/
export default Ember.Object.extend({
  init: function() {
    this.filteredRecordArrays = MapWithDefault.create({
      defaultValue: function() { return []; }
    });

    this.changedRecords = [];
    this._adapterPopulatedRecordArrays = [];
  },

  recordDidChange: function(record) {
    if (this.changedRecords.push(record) !== 1) { return; }

    Ember.run.schedule('actions', this, this.updateRecordArrays);
  },

  recordArraysForRecord: function(record) {
    record._recordArrays = record._recordArrays || OrderedSet.create();
    return record._recordArrays;
  },

  /**
    This method is invoked whenever data is loaded into the store by the
    adapter or updated by the adapter, or when a record has changed.

    It updates all record arrays that a record belongs to.

    To avoid thrashing, it only runs at most once per run loop.

    @method updateRecordArrays
    @param {Class} type
    @param {Number|String} clientId
  */
  updateRecordArrays: function() {
    forEach(this.changedRecords, function(record) {
      if (get(record, 'isDeleted')) {
        this._recordWasDeleted(record);
      } else {
        this._recordWasChanged(record);
      }
    }, this);

    this.changedRecords.length = 0;
  },

  _recordWasDeleted: function (record) {
    var recordArrays = record._recordArrays;

    if (!recordArrays) { return; }

    recordArrays.forEach(function(array){
      array.removeRecord(record);
    });

    record._recordArrays = null;
  },


  //Don't need to update non filtered arrays on simple changes
  _recordWasChanged: function (record) {
    var type = record.constructor;
    var recordArrays = this.filteredRecordArrays.get(type);
    var filter;

    forEach(recordArrays, function(array) {
      filter = get(array, 'filterFunction');
      if (filter) {
        this.updateRecordArray(array, filter, type, record);
      }
    }, this);
  },

  //Need to update live arrays on loading
  recordWasLoaded: function(record) {
    var type = record.constructor;
    var recordArrays = this.filteredRecordArrays.get(type);
    var filter;

    forEach(recordArrays, function(array) {
      filter = get(array, 'filterFunction');
      this.updateRecordArray(array, filter, type, record);
    }, this);
  },
  /**
    Update an individual filter.

    @method updateRecordArray
    @param {DS.FilteredRecordArray} array
    @param {Function} filter
    @param {Class} type
    @param {Number|String} clientId
  */
  updateRecordArray: function(array, filter, type, record) {
    var shouldBeInArray;
    var self = this;
    var key = guidFor(record);
    var currentPromise = null;

    if (!filter) {
      shouldBeInArray = true;
    } else {
      shouldBeInArray = filter(record);
    }

    if (!shouldBeInArray || !get(shouldBeInArray, 'then')) {
      this._syncRecordArray(record, array, shouldBeInArray);
    } else {
      currentPromise = shouldBeInArray;
      array.lastFilterPromises[key] = currentPromise;
      currentPromise.then(function(shouldBeInArray){
        // fighting race conditions here
        if (currentPromise !== array.lastFilterPromises[key]) {
          return;
        }

        delete array.lastFilterPromises[key];
        self._syncRecordArray(record, array, shouldBeInArray);
      });
    }
  },

  _syncRecordArray: function(record, array, shouldBeInArray) {
    var recordArrays = this.recordArraysForRecord(record);
    if (shouldBeInArray) {
      if (!recordArrays.has(array)) {
        array.pushRecord(record);
        recordArrays.add(array);
      }
    } else if (!shouldBeInArray) {
      recordArrays.delete(array);
      array.removeRecord(record);
    }
  },

  /**
    This method is invoked if the `filterFunction` property is
    changed on a `DS.FilteredRecordArray`.

    It essentially re-runs the filter from scratch. This same
    method is invoked when the filter is created in th first place.

    @method updateFilter
    @param {Array} array
    @param {String} type
    @param {Function} filter
  */
  updateFilter: function(array, type, filter) {
    var typeMap = this.store.typeMapFor(type);
    var records = typeMap.records, record;

    for (var i=0, l=records.length; i<l; i++) {
      record = records[i];

      if (!get(record, 'isDeleted') && !get(record, 'isEmpty')) {
        this.updateRecordArray(array, filter, type, record);
      }
    }
  },

  /**
    Create a `DS.RecordArray` for a type and register it for updates.

    @method createRecordArray
    @param {Class} type
    @return {DS.RecordArray}
  */
  createRecordArray: function(type) {
    var array = RecordArray.create({
      type: type,
      content: Ember.A(),
      store: this.store,
      isLoaded: true,
      manager: this
    });

    this.registerFilteredRecordArray(array, type);

    return array;
  },

  /**
    Create a `DS.FilteredRecordArray` for a type and register it for updates.

    @method createFilteredRecordArray
    @param {Class} type
    @param {Function} filter
    @param {Object} query (optional
    @return {DS.FilteredRecordArray}
  */
  createFilteredRecordArray: function(type, filter, query) {
    var array = FilteredRecordArray.create({
      query: query,
      type: type,
      content: Ember.A(),
      store: this.store,
      manager: this,
      filterFunction: filter
    });

    this.registerFilteredRecordArray(array, type, filter);

    return array;
  },

  /**
    Create a `DS.AdapterPopulatedRecordArray` for a type with given query.

    @method createAdapterPopulatedRecordArray
    @param {Class} type
    @param {Object} query
    @return {DS.AdapterPopulatedRecordArray}
  */
  createAdapterPopulatedRecordArray: function(type, query) {
    var array = AdapterPopulatedRecordArray.create({
      type: type,
      query: query,
      content: Ember.A(),
      store: this.store,
      manager: this
    });

    this._adapterPopulatedRecordArrays.push(array);

    return array;
  },

  /**
    Register a RecordArray for a given type to be backed by
    a filter function. This will cause the array to update
    automatically when records of that type change attribute
    values or states.

    @method registerFilteredRecordArray
    @param {DS.RecordArray} array
    @param {Class} type
    @param {Function} filter
  */
  registerFilteredRecordArray: function(array, type, filter) {
    var recordArrays = this.filteredRecordArrays.get(type);
    recordArrays.push(array);

    this.updateFilter(array, type, filter);
  },

  /**
    Unregister a FilteredRecordArray.
    So manager will not update this array.

    @method unregisterFilteredRecordArray
    @param {DS.RecordArray} array
  */
  unregisterFilteredRecordArray: function(array) {
    var recordArrays = this.filteredRecordArrays.get(array.type);
    var index = indexOf(recordArrays, array);
    recordArrays.splice(index, 1);
  },

  willDestroy: function(){
    this._super();

    forEach(flatten(values(this.filteredRecordArrays.values)), destroy);
    forEach(this._adapterPopulatedRecordArrays, destroy);
  }
});

function values(obj) {
  var result = [];
  var keys = Ember.keys(obj);

  for (var i = 0; i < keys.length; i++) {
    result.push(obj[keys[i]]);
  }

  return result;
}

function destroy(entry) {
  entry.destroy();
}

function flatten(list) {
  var length = list.length;
  var result = Ember.A();

  for (var i = 0; i < length; i++) {
    result = result.concat(list[i]);
  }

  return result;
}
