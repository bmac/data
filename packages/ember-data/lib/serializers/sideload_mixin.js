var map = Ember.ArrayPolyfills.map;

export default Ember.Mixin.create({

  extractSingle: function(store, primaryType, payload, recordId, requestType) {
    this.sideloadRecords(store, primaryType, payload);
    return this._super(store, primaryType, payload, recordId, requestType);
  },

  extractArray: function(store, primaryType, payload, recordId, requestType) {
    this.sideloadRecords(store, primaryType, payload);
    return this._super(store, primaryType, payload, recordId, requestType);
  },

  sideloadRecords: function(store, primaryType, payload) {
    var rootProp = this.rootForType(primaryType.typeKey);
    for (var prop in payload) {
      var typeKey = prop;

      if (rootProp === prop) {
        continue; // Don't sideload the root payload.
      }
      if (prop.charAt(0) === '_') {
        typeKey = prop.substr(1);
      }

      var typeName = this.typeForRoot(typeKey);
      var type = store.modelFor(typeName);
      var typeSerializer = store.serializerFor(type);
      /*jshint loopfunc:true*/
      var normalizedArray = map.call(payload[prop], function(hash) {
        return typeSerializer.normalize(type, hash, prop);
      }, this);
      store.pushMany(typeName, normalizedArray);
    }
  }
});
