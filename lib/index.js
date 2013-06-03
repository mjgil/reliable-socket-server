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

  socket.on('data', function(data) {
    self.handleData(data);
  });

  this.overrideSend(socket);
}

ReliableServer.prototype.handleData = function(data) {
  var array = data.split(':')
  var key = array.shift();
  var value = array.join(':');
  


  if (key === 'getSID') {
    // sending sessionID
    var sid = base64id.generateId();
    socket._sid = sid;
    socket._send('sessionID:' + sid);
    var thisSession = this.sessions[sid] = {};
    thisSession.socket = socket;
    thisSession.packetCount = 0;
    thisSession.packetBuffer = [];
    this.temp_sessions[socket._tid].forEach(function(data) {
      var packet = self.buildPacket(data, sid);
      socket._send(packet);
    });
  }



  else if (key === 'ack') {
    var buffer = self.sessions[this._sid].packetBuffer;
    var l = buffer.length;
    console.log('first buffer len: ', l);

    // remove acknowledged packets from packet buffer
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
    var queryObj = qs.parse(value),
        sid = queryObj.session,
        session = self.sessions[sid],
        buffer = session.packetBuffer,
        oldSocket = session.socket;
        l = buffer.length,
        lastSeen = parseInt(queryObj.last, 10);

    // send the missed packets
    for (var i = 0; i < l; i++) {
      var packet = buffer[i];
      console.log(packet);
      if (packet[i] > lastSeen) this._send('missed:' + packet);
      buffer.splice(i);
    }

    // replace the old socket with the new one
    oldSocket.close();
    this._sid = sid;
    session.socket = this;
    this.temp_sessions[socket._tid].forEach(function(data) {
      var packet = self.buildPacket(data, sid);
      socket._send(packet);
    });
  }
}

// overwriting send function to 
// listen on the packets as they are sent
// from the server
ReliableServer.prototype.overrideSend = function(socket) {
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
}


ReliableServer.prototype.buildPacket = function(data, sid) {
  var session = this.sessions[sid];
  session.packetCount++;
  var packet = [session.packetCount, data]
  session.packetBuffer.push(packet);
  return packet;
}