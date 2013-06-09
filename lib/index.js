/**
 * Module requirements.
 */
 var qs = require('querystring')
  , parse = require('url').parse
  , base64id = require('base64id')
  , EventEmitter = require('events').EventEmitter
  , parser = require('../../reliable-socket-protocol')
  , debug = require('debug')('reliable:server');


/**
 * Server constructor.
 *
 * @api public
 */

module.exports = ReliableServer;

function ReliableServer() {
  this.sessions = {};
  this.temp_sessions = {};
  if (!(this instanceof ReliableServer)) return new ReliableServer();
};

/**
 * Inherits from EventEmitter.
 */

ReliableServer.prototype.__proto__ = EventEmitter.prototype;


/**
 * Add socket for watching
 *
 * @param {Socket} 
 * @api public
 */

ReliableServer.prototype.addSocket = function(socket) {
  var id = base64id.generateId(),
      self = this;

  socket._tid = id;
  this.temp_sessions[id] = [];

  this.overrideSend(socket);
  this.overrideOnData(socket);
};


ReliableServer.prototype.onOpen = function (socket, data) {
  debug('onOpen called');
  var self = this,
      sid = base64id.generateId(),
      thisSession = this.sessions[sid] = {},
      bufferedPackets = [],
      sendPacket;

  socket._sid = sid;
  socket._send(parser.packets.sid + sid);
  thisSession.socket = socket;
  thisSession.packetCount = 0;
  thisSession.writeBuffer = [];

  this.temp_sessions[socket._tid].forEach(function(data) {
    var packet = self.buildPacket(data, sid);
    bufferedPackets.push(packet);
  });

  sendPacket = parser.encodePacket({type: 'message', data: bufferedPackets});
  socket._send(sendPacket);
};

ReliableServer.prototype.onClose = function (socket, data) {
  debug('onClose called');
  socket.close();
};

ReliableServer.prototype.onAck = function (socket, data) {
  debug('onAck called');

  var buffer = this.sessions[socket._sid].writeBuffer,
      sentID = parseInt(data,10),
      l = buffer.length;

  if (!isNaN(sentID)) {
    debug('first buffer len: %s', buffer.length);
    // remove acknowledged packet from packet buffer
    for (var i = 0; i < l; i++) {
      var packet = buffer[i];
      var bufferID = packet[0];
      if (bufferID === sentID) {
        buffer.splice(i--, 1);
        break;
      }
    }
    debug('second buffer len: %s', buffer.length);
  }
};

ReliableServer.prototype.onRecon = function (socket, data) {
  debug('onRecon called');
  var queryObj = qs.parse(data),
          sid = queryObj.session,
          session = this.sessions[sid],
          buffer = session.writeBuffer,
          l = buffer.length,
          oldSocket = session.socket;
          lastSeen = parseInt(queryObj.last, 10);

  // close the old socket
  oldSocket.send = oldSocket.write = function(){};
  oldSocket.close();

  // send the missed packets
  for (var i = 0; i < l; i++) {
    var packet = buffer[i];
    if (packet[0] > lastSeen) {
      socket._send(parser.packets.missed + packet);
    }
  }

  // replace the old socket with the new one
  socket._sid = sid;
  session.socket = socket;
  this.temp_sessions[socket._tid].forEach(function(data) {
    var packet = self.buildPacket(data, sid);
    socket._send(packet);
  });
};

ReliableServer.prototype.onMessage = function (socket, data) {
  debug('onMessage called');

};

/**
 * Overwritting Send Function
 * to listen on the packets as they
 * are sent from the server
 *
 * @param {Socket}
 * @returns {Socket} 
 * @api private
 */
ReliableServer.prototype.overrideSend = function(socket) {
  debug('overrideSend called');
  var self = this,
      proxy = socket.send;
  
  socket._send = proxy;
  socket.send =
  socket.write = function(data, callback) {
    var sid = this._sid;
    if (!sid) {
      var tid = this._tid;
      self.temp_sessions[tid].push(data);
      return this;
    }
    else {
      var packet = self.buildPacket(data, sid);
      return proxy.apply(this, [packet, callback]);
    }
  }
};



/**
 * Overwritting Send Function
 * to listen on the packets as they
 * are sent from the server
 *
 * @param {Socket}
 * @returns {Socket} 
 * @api private
 */
ReliableServer.prototype.overrideOnData = function(socket) {
  debug('overrideOnData called');
  var self = this,
      dataListeners = socket.listeners('data');

  // replace any preattached listeners
  dataListeners.forEach(function(listener) {
    socket.removeListener('data', listener);
    var newFN = buildReplacementDataHandler(socket, listener);
    socket.addListener('data', newFN);
  });

  // override the 'on' method so new listeners 
  // have the same functionality as well
  var proxy = socket.on;
  socket._on = socket.on;
  socket.on = function(eventName, fn) {
    if (eventName === 'data') {
      var newFN = buildReplacementDataHandler(socket, fn);
      return proxy.apply(this, [eventName, newFN]);
    }
    return proxy.apply(this, [eventName, fn]);
  }

  // builds function that parses the packet before
  // sending it to the user facing server
  function buildReplacementDataHandler(socket, oldHandler) {
    var newFN = function(data) {
      var packet = parser.decodePacket(data);
      if (packet.type === 'error') {
        console.log('Error occured when parsing packet');
      }
      else {
        // call method on server to handle the data
        var fnName = 'on' + capFirstLetter(packet.type);
        self[fnName](socket, packet.data);

        // call the old one
        if (typeof oldHandler === 'function') {
          oldHandler(packet.data);
        }
      }

      function capFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
      }
    }
  }

  return newFN;
};


/**
 * Builds a new packet for sending over the socket
 * connection and adds it to the writeBuffer
 * 
 * @param  {Object} data 
 * @param  {String} sid
 * @return {String} <type><data> ex. 1[[3,'test'],[4,'awesome']]
 * @api private
 */
ReliableServer.prototype.buildPacket = function(data, sid) {
  debug('buildPacket called');
  var session = this.sessions[sid],
      packet, packetObj;

  session.packetCount++;
  packet = [session.packetCount, data]
  session.writeBuffer.push(packet);
  packetObj = {type: 'message', data: JSON.stringify(packet)};
  return parser.encodePacket(packetObj);
};