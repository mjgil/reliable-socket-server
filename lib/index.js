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
  this.temp_sessions[id] = {};
  this.temp_sessions[id].writeBuffer = [];
  this.temp_sessions[id].seenObj = {};
  this.temp_sessions[id].lastSeen = 0;

  this.overrideSend(socket);
  this.overrideOnData(socket);
};



/**
 * Generates a new session id, initializes the session,
 * sends the session id to the client, and sends buffered
 * packets down to the client
 * 
 * @param  {Object} socket
 * @api private
 */
ReliableServer.prototype.onOpen = function (socket) {
  debug('onOpen called');
  var self = this,
      sid = base64id.generateId(),
      thisSession = this.sessions[sid] = {},
      bufferedPackets = [],
      sendPacket;

  socket._sid = sid;
  socket._send(parser.encodePacket({type: 'sid', data: sid}));
  thisSession.socket = socket;
  thisSession.packetCount = 0;
  thisSession.writeBuffer = [];
  thisSession.seenObj = this.temp_sessions[socket._tid].seenObj;
  thisSession.lastSeen = this.temp_sessions[socket._tid].lastSeen;

  this.temp_sessions[socket._tid].writeBuffer.forEach(function(data) {
    var packet = self.buildPacket(data, sid);
    bufferedPackets.push(packet);
  });

  sendPacket = parser.encodePacket({type: 'message', data: bufferedPackets});
  socket._send(sendPacket);
};



/**
 * Closes the socket
 *
 * @param  {Object} socket
 * @api private
 */
ReliableServer.prototype.onClose = function (socket) {
  debug('onClose called');
  socket.close();
};



/**
 * Removes the packet with the specified id
 * from the writeBuffer
 *
 * @param  {Object} socket
 * @param  {String} data <id>
 * @api private
 */
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



/**
 * Handles client reconnect requests: closes the old session 
 * socket, sends the potentially missed packets to the client,
 * replaces the old socket with the newly connected one, and
 * sends any buffered packets down to the client
 *
 * @param  {Object} socket
 * @param  {Array} data [[<id>,<data>],[<id>,<data>]]
 * @api private
 */
ReliableServer.prototype.onRecon = function (socket, data) {
  debug('onRecon called');
  var queryObj = qs.parse(data),
      self = this,
      sid = queryObj.session,
      session = this.sessions[sid],
      buffer = session.writeBuffer,
      l = buffer.length,
      oldSocket = session.socket;
      lastSeen = parseInt(queryObj.last, 10),
      bufferedPackets = [],
      missedPackets = [];

  // close the old socket
  oldSocket.send = oldSocket.write = function(){};
  oldSocket.close();

  // send the missed packets
  for (var i = 0; i < l; i++) {
    var packet = buffer[i];
    if (packet[0] > lastSeen) {
      missedPackets.push(packet);
    }
  }
  var packetObj = {type: 'message', data: missedPackets};
  socket._send(parser.encodePacket(packetObj));

  // replace the old socket with the new one
  socket._sid = sid;
  session.socket = socket;
  this.temp_sessions[socket._tid].writeBuffer.forEach(function(data) {
    var packet = self.buildPacket(data, sid)
    bufferedPackets.push(packet);
  });

  packetObj = {type: 'message', data: bufferedPackets};
  socket._send(parser.encodePacket(packetObj));
};



/**
 * Marks the packet id from the client as
 * seen and sends an acknowledgement to the client
 *
 * @param  {Object} socket
 * @param  {Array} data [[<id>,<data>],[<id>,<data>]]
 * @api private
 */
ReliableServer.prototype.onMessage = function (socket, data) {
  debug('onMessage called');
  var session = this.getSession(socket),
      self = this;

  data.forEach(function(packet) {
    var id = packet[0];
    session.lastSeen = id;
    session.seenObj[id] = true;

    var packetObj = {type: 'ack', data: id};
    socket._send(parser.encodePacket(packetObj));
  });
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
      self.temp_sessions[tid].writeBuffer.push(data);
      return this;
    }
    else {
      var packet = self.buildPacket(data, sid),
          packetObj = {type: 'message', data: [packet]};
      return proxy.apply(this, [parser.encodePacket(packetObj), callback]);
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
        // call the old one
        if (typeof oldHandler === 'function') {
          if (packet.type === 'message') {
            var session = self.getSession(socket);
            packet.data.forEach(function(data) {
              var packetID = data[0];

              // but only if we haven't seen it before
              if (!session.seenObj[packetID]) {
                oldHandler(data[1]);
              }
            });

          }
        }

        // call method on server to handle the data
        var fnName = 'on' + capFirstLetter(packet.type);
        self[fnName](socket, packet.data);
      }

      function capFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
      }
    }
    return newFN;
  }

};


/**
 * Builds a new packet for sending over the socket
 * connection and adds it to the writeBuffer
 * 
 * @param  {Object} data 
 * @param  {String} sid
 * @return {Array} [<type>,<data>] ex. [3,'test']
 * @api private
 */
ReliableServer.prototype.buildPacket = function(data, sid) {
  debug('buildPacket called');
  var session = this.sessions[sid],
      packet, packetObj;

  session.packetCount++;
  packet = [session.packetCount, data]
  session.writeBuffer.push(packet);
  return packet;
};




/**
 * Gets the current session associated with a socket
 * 
 * @param  {Object} socket 
 * @return {Object} session
 * @api private
 */
ReliableServer.prototype.getSession = function(socket) {
  debug('getSession called');

  var didHanshake = (undefined !== socket._sid),
    id = (didHanshake) ? socket._sid : socket._tid,
    session = (didHanshake) ? this.sessions[id] : this.temp_sessions[id];

  return session;
};