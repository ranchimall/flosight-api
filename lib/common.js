'use strict';

var _ = require('lodash');
var AddressTranslator = require('./addresstranslator');
var flocore = require('flocore-lib');

function Common(options) {
  this.log = options.log;
  this.translateAddresses = options.translateAddresses;
}

Common.prototype.notReady = function (err, res, p) {
  res.status(503).send('Server not yet ready. Sync Percentage:' + p);
};

Common.prototype.notReady_ws = function (err, ws, p) {
  if(ws.readyState !== ws.OPEN)
    return;
  ws.send({error: {message: 'Server not yet ready. Sync Percentage:' + p, code: 503}});
  ws.close();
};

Common.prototype.bindStopFlagOnClose = function (res_ws, obj) {
  res_ws.on("close", () => obj.flag_stop = true);
};

Common.prototype.handleErrors = function (err, res) {
  if (err) {
    if (err.code)  {
      if (!res.headerSent)
        res.status(400).send(err.message + '. Code:' + err.code);
    } else {
      this.log.error(err.stack);
      if (!res.headerSent)
        res.status(503).send(err.message);
    }
  } else {
    if (!res.headerSent)
      res.status(404).send('Not found');
  }
};

Common.prototype.handleErrors_ws = function (err, ws, close = true) {
  if(ws.readyState !== ws.OPEN)
    return;
  if (err) {
    if (err.code)  
      ws.send({error: {message: err.message, code: err.code}});
    else {
      this.log.error(err.stack);
      ws.send({error: {message: err.message, code: 503}});
    }
  } else {
    ws.send({error: {message: 'Not found', code: 404}});
  }
  if(close)
    ws.close();
}

Common.prototype.translateInputAddresses= function(addresses) {
  var self = this;

  if (!addresses) return;

  if (!_.isArray(addresses))
    addresses = [ addresses ];

  function check(addresses) {
    if (!addresses) return; 

    for(var i = 0; i < addresses.length; i++) {
      try {
        new flocore.Address(addresses[i]);
      } catch(e) {

        throw addresses[i];
      }
    }
  }
  
  if (this.translateAddresses) {
    addresses = AddressTranslator.translateInput(addresses);
  } else 
    check(addresses);

  return addresses;
};




Common.prototype.translateOutputAddress= function(address) {
  if (!this.translateAddresses) return address;
  return AddressTranslator.translateOutput(address);
};


module.exports = Common;
