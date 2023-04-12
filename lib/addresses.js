'use strict';

var flocore = require('flocore-lib');
var Unit = flocore.Unit;
var async = require('async');
var TxController = require('./transactions');
var Common = require('./common');
var _ = require('lodash');

function AddressController(node, translateAddresses) {
  this.node = node;
  this._address = this.node.services.address;
  this._block = this.node.services.block;
  this.txController = new TxController(node, translateAddresses);
  this.common = new Common({log: this.node.log, translateAddresses: translateAddresses});
  this._block = this.node.services.block;
}

AddressController.prototype.show = function(req, res) {
  var self = this;
  var options = {
    noTxList: parseInt(req.query.noTxList)
  };

  self.common.bindStopFlagOnClose(res, options);

  /*DEPRECATED
  if (req.query.from && req.query.to) {
    options.from = parseInt(req.query.from);
    options.to = parseInt(req.query.to);
  }*/

  if (req.query.after) {
    options.after = req.query.after;
  }

  self._address.getAddressSummary(req.addr, options, function(err, data) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    if (data && data.addrStr)
      data.addrStr = self.common.translateOutputAddress(data.addrStr);


    res.jsonp(data);
  });
};

AddressController.prototype.show_ws = function(ws, req) {
  var self = this;
  var options = { noTxList: true };

  if (req.query.after) {
    options.after = req.query.after;
  }

  self.common.bindStopFlagOnClose(ws, options);

  self._address.getAddressSummary(req.addr, options, function (err, data) {
    if(err) {
      return self.common.handleErrors_ws(err, ws);
    }

    ws.send({data});

  }, function(err, result) {

    if(err) {
      return self.common.handleErrors_ws(err, ws);
    }

    if(ws.readyState === ws.OPEN){
      ws.send({result});
      ws.close();
    }

  });
};

AddressController.prototype.balance = function(req, res) {
  this.addressSummarySubQuery(req, res, 'balance');
};

AddressController.prototype.totalReceived = function(req, res) {
  this.addressSummarySubQuery(req, res, 'totalReceived');
};

AddressController.prototype.totalSent = function(req, res) {
  this.addressSummarySubQuery(req, res, 'totalSent');
};

AddressController.prototype.unconfirmedBalance = function(req, res) {
  this.addressSummarySubQuery(req, res, 'unconfirmedBalance');
};

AddressController.prototype.addressSummarySubQuery = function(req, res, param) {
  var self = this;
  var options = { noTxList: true };

  if (req.query.after) {
    options.after = req.query.after;
  }

  self.common.bindStopFlagOnClose(res, options);

  self._address.getAddressSummary(req.addr, options, function(err, data) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    if(data.incomplete)
      res.jsonp({lastItem: data.lastItem, data: data[param]});
    else
      res.jsonp(data[param]);
  });
};

AddressController.prototype.getAddressSummary = function(address, options, callback) {
  var self = this;

  self._address.getAddressSummary(address, options, function(err, summary) {
    if(err) {
      return callback(err);
    }

    var transformed = {
      address: self.common.translateOutputAddress(address),
      balance: summary.balance,
      balanceSat: summary.balanceSat,
      totalReceived: summary.totalReceived,
      totalReceivedSat: summary.totalReceivedSat,
      totalSent: summary.totalSent,
      totalSentSat: summary.totalSentSat,
      unconfirmedBalance: summary.unconfirmedBalance,
      unconfirmedBalanceSat: summary.unconfirmedBalanceSat,
      unconfirmedTxApperances: summary.unconfirmedTxApperances,
      txApperances: summary.txApperances,
      transactions: summary.transactions
    };

    callback(null, transformed);
  });
};

AddressController.prototype.checkAddrs = function(req, res, next) {
  var self = this;

  function makeArray(addrs) {
    if (_.isString(addrs)) {
      return addrs.split(',');
    }
    return addrs;
  }

  if (req.params.addr) {
    req.addr = req.params.addr;
    req.addrs = [req.addr];
  } else if(req.body.addrs) {
    req.addrs = makeArray(req.body.addrs);
  } else {
    req.addrs = makeArray(req.params.addrs);
  }

  if(!_.isArray(req.addrs) || _.compact(req.addrs).length < 1) {
    return self.common.handleErrors({
      message: 'Must include address',
      code: 1
    }, res);
  }

  try {
    req.addrs = self.common.translateInputAddresses(req.addrs);
    req.addr = req.addrs[0];
  } catch(e) {
console.log('[addresses.js.130]', e); //TODO
    return self.common.handleErrors({
      message: 'Invalid address: ' + e,
      code: 1
    }, res);
  }

  next();
};

AddressController.prototype.utxo = function(req, res) {
  var self = this;

  self._address.getAddressUnspentOutputs(req.addr, {}, function(err, utxos) {
    var results;
    if(err) {
      return self.common.handleErrors(err, res);
    } else if (!utxos.length) {
      results = [];
    }
    results = utxos.map(self.transformUtxo.bind(self));
    res.jsonp(results);
  });
};


AddressController.prototype.transformUtxo = function(utxoArg) {

  var utxo = {
    address: this.common.translateOutputAddress(utxoArg.address),
    txid: utxoArg.txid,
    vout: utxoArg.vout,
    scriptPubKey: utxoArg.scriptPubKey,
    amount: utxoArg.satoshis / 1e8,
    satoshis: utxoArg.satoshis
  };
  if (utxoArg.height && utxoArg.height > 0) {
    utxo.height = utxoArg.height;
    utxo.confirmations = this._block.getTip().height - utxoArg.height + 1;
  } else {
    utxo.confirmations = 0;
  }
  if (utxoArg.timestamp) {
    utxo.ts = utxoArg.timestamp;
  }
  return utxo;
};

AddressController.prototype._getTransformOptions = function(req) {
  return {
    noAsm: parseInt(req.query.noAsm) ? true : false,
    noScriptSig: parseInt(req.query.noScriptSig) ? true : false,
    noSpent: parseInt(req.query.noSpent) ? true : false
  };
};

// this call could take a while to run depending on what addresses are used
// considering memory constraints,  we will streaming out the results for addresses
// not necessarily in the order we received them
AddressController.prototype.multiutxo = function(req, res) {

  var self = this;

  var addresses;

  if (_.isArray(req.addrs)) {
    addresses = _.uniq(req.addrs);
  } else {
    addresses = _.compact(req.addrs.split(','));
  }

  var addressesLeft = addresses.length;
  var startedWriting = false;
  var cache = [];

  res.write('[');

  var sep = ',';

  async.eachLimit(addresses, 4, function(addr, next) {

    self._address.getAddressUnspentOutputs(addr, {}, function(err, utxos) {

      if (err) {
        return next(err);
      }

      if (addressesLeft-- > 0 && utxos.length > 0 && startedWriting) {
        res.write(sep);
      }

      for(var i = 0; i < utxos.length; i++) {
        startedWriting = true;
        if (utxos.length - 1 === i) {
          sep = '';
        }
        utxos[i] = self.transformUtxo(utxos[i]);
        cache.push(utxos[i]);
        res.write(JSON.stringify(utxos[i]) + sep);
      }

      sep = ',';
      next();

    });

  }, function(err) {

      if (err) {
        return self.common.handleErrors(err, res);
      }

      res.write(']');
      res.end();
  });

};

AddressController.prototype.multitxs = function(req, res) {
  var self = this;

  var options = {};

  options.after = req.query.after || req.body.after || undefined;

  //mempool options
  if(!_.isUndefined(req.query.mempool) || !_.isUndefined(req.body.mempool)){    
    var mempool = !_.isUndefined(req.query.mempool) ? req.query.mempool : req.body.mempool;
    if(mempool == 'true') { //DEFAULT config in query fn
      options.mempoolOnly = false;
      options.queryMempool = true;
    } else if(mempool == 'false') {
      options.mempoolOnly = false;
      options.queryMempool = false;
    } else if(mempool == 'only') {
      options.mempoolOnly = true;
      options.queryMempool = true;
    }
  }
  
  //Temporary support
  if(req.query.from || req.body.from) {
    options.from =  parseInt(req.query.from) || parseInt(req.body.from) || undefined;
  }

  //Temporary support
  if(req.query.to || req.body.to) {
    options.to =  parseInt(req.query.to) || parseInt(req.body.to) || undefined;
  }

  self.common.bindStopFlagOnClose(res, options);

  self._address.getAddressHistory(req.addrs, options, function(err, result) {

    if(err) {
      return self.common.handleErrors(err, res);
    }

    var transformOptions = self._getTransformOptions(req);

    self.transformAddressHistoryForMultiTxs(result.items, transformOptions, function(err, items) {

      if (err) {
        return self.common.handleErrors(err, res);
      }

      var lastItem = items.find(a => a.confirmations !== 0), //assuming items is recent tx first order
      lastItem = typeof lastItem === 'object' ? lastItem.txid: undefined 
      
      var ret = {
        totalItems: result.totalCount,
        lastItem: lastItem,
        //from: options.from,
        //to: Math.min(options.to, result.totalCount),
        items: items
      };

      res.jsonp(ret);
    });

  });
};

AddressController.prototype.multitxs_ws = function(ws, req) {
  var self = this;

  var options = {};

  if (req.query.after) {
    options.after = req.query.after;
  }

  options.txNotNeeded = true;

  var transformOptions = self._getTransformOptions(req);

  self.common.bindStopFlagOnClose(ws, options);

  var lastItem = {id: '', height: 0};

  self._address.getAddressHistory(req.addrs, options, function (err, data) {
    if(err) {
      return self.common.handleErrors_ws(err, ws, false);
    }

    self.txController.transformTransaction(data, transformOptions, function(err, tx){

      if(err) {
        return self.common.handleErrors_ws(err, ws, false);
      }

      //finding the last key (useful for `after` option on next request call)
      if(tx.confirmations)
        if(lastItem.height < tx.blockheight || (lastItem.height == tx.blockheight && lastItem.id < tx.txid)){
          lastItem.id = tx.txid; 
          lastItem.height = tx.blockheight;
        }
      
      ws.send({data: tx})
    
    });

  }, function(err, result) {

    if(err) {
      return self.common.handleErrors_ws(err, ws);
    }

    var ret = {
      totalItems: result.totalCount,
      lastItem: lastItem.id
    }

    if(ws.readyState === ws.OPEN){
      ws.send({result: ret});
      ws.close();
    }

  });
};

AddressController.prototype.transformAddressHistoryForMultiTxs = function(txs, options, callback) {
  var self = this;

  async.map(
    txs,
    function(tx, next) {
      self.txController.transformTransaction(tx, options, next);
    },
    callback
  );
};

module.exports = AddressController;
