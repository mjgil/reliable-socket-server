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
  this.packets = {
    open: 0,
    sid: 1,
    recon: 2,
    ack: 3,
    missed: 4,
    message: 5
  };
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
    self.handleData(this, data);
  });

  this.overrideSend(socket);
}

ReliableServer.prototype.handleData = function(socket, data) {
  console.log('orig data: ', data);
  var self = this,
      type = parseInt(data.charAt(0),10),
      data = data.substring(1);

  if (!isNaN(type)) {
    var isNewSocket = (type === this.packets.open),
        isAcknowledgement = (type === this.packets.ack),
        isReconnecting = (type === this.packets.recon);

    if (isNewSocket) {
      // sending sessionID
      var sid = base64id.generateId();
      socket._sid = sid;
      socket._send(this.packets.sid + sid);
      var thisSession = this.sessions[sid] = {};
      thisSession.socket = socket;
      thisSession.packetCount = 0;
      thisSession.packetBuffer = [];
      this.temp_sessions[socket._tid].forEach(function(data) {
        var packet = self.buildPacket(data, sid);
        socket._send(packet);
      });
    }



    else if (isAcknowledgement) {
      var buffer = self.sessions[socket._sid].packetBuffer;
      var sentID = parseInt(data,10);
      var l = buffer.length;
      if (!isNaN(sentID)) {
        console.log('first buffer len: ', buffer.length);

        // remove acknowledged packet from packet buffer
        for (var i = 0; i < l; i++) {
          var packet = buffer[i];
          var bufferID = packet[0];
          if (bufferID === sentID) {
            buffer.splice(i--, 1);
            break;
          }
        }
      }
    }


    else if (isReconnecting) {
      var queryObj = qs.parse(data),
          sid = queryObj.session,
          session = this.sessions[sid],
          buffer = session.packetBuffer,
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
          socket._send(this.packets.missed + packet);
        }
      }

      // replace the old socket with the new one
      socket._sid = sid;
      session.socket = socket;
      this.temp_sessions[socket._tid].forEach(function(data) {
        var packet = self.buildPacket(data, sid);
        socket._send(packet);
      });
    }
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
  return (this.packets.message + String(packet));
}