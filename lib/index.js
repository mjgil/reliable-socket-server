/**
 * Module requirements.
 */
 var qs = require('querystring')
  , parse = require('url').parse
  , base64id = require('base64id')
  , EventEmitter = require('events').EventEmitter;


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
}

/**
 * Inherits from EventEmitter.
 */

ReliableServer.prototype.__proto__ = EventEmitter.prototype;

ReliableServer.prototype.addSocket = function(socket) {
  var id = base64id.generateId(),
      self = this;

  socket._tid = id;
  this.sessions[id] = {};
  this.sessions[id].socket = socket;
  this.sessions[id].packetCount = 0;
  this.sessions[id].packetBuffer = [];

  socket.on('data', function(data) {
    var array = data.split(':')
    var key = array.shift();
    var value = array.join(':');
    if (key === 'ack') {
      var buffer = self.sessions[socket._sid].packetBuffer;
      var l = buffer.length;
      console.log('first buffer len: ', l);
      for (var i = 0; i < l; i++) {
        var packet = buffer[i];
        var bufferID = packet[0];
        if (bufferID == parseInt(value,10)) {
          buffer.splice(i);
          console.log('second buffer len: ', buffer.length);
        }
      }
    }
    else if (key === 'getMissed') {
      var queryObj = qs.parse(value);
      var buffer = self.sessions[queryObj.session].packetBuffer;
      var l = buffer.length;
      var lastSeen = parseInt(queryObj.last, 10);
      for (var i = 0; i < l; i++) {
        var packet = buffer[i];
        console.log(packet);
        if (packet[i] > lastSeen) socket._send('missed:' + packet);
        buffer.splice(i);
      }
    }
    else if (key === 'getSID') {
      // sending sessionID

      socket.send('sessionID:' + id);
    }
  });


  // overwriting send function to 
  // listen on the packets as they are sent
  // from the server
  var proxy = socket.send;
  socket._send = proxy;
  socket.send =
  socket.write = function(data, callback) {
    var session = self.sessions[socket._sid];
    session.packetCount++;
    var packet = [session.packetCount, data]
    session.packetBuffer.push(packet);
    return proxy.apply(this, [packet, callback]);
  }
}
