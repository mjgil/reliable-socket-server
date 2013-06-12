var reliableServerConstructor = require('../index'),
  expect = require('expect.js'),
  parser = require('reliable-socket-protocol'),
  jstring = JSON.stringify;

describe('reliable-server', function () {


  describe('contructor', function () {
    it('should be a function', function() {
      expect(reliableServerConstructor).to.be.a('function');
    });

    it('should initialize correctly', function() {
      var reliableServer = reliableServerConstructor();
      expect(reliableServer).to.be.an('object');
      expect(reliableServer.sessions).to.be.an('object');
      expect(reliableServer.temp_sessions).to.be.an('object');
      expect(reliableServer.addSocket).to.be.a('function');
      expect(reliableServer.onOpen).to.be.a('function');
      expect(reliableServer.onClose).to.be.a('function');
      expect(reliableServer.onAck).to.be.a('function');
      expect(reliableServer.onRecon).to.be.a('function');
      expect(reliableServer.onMessage).to.be.a('function');
      expect(reliableServer.overrideSend).to.be.a('function');
      expect(reliableServer.overrideOnData).to.be.a('function');
      expect(reliableServer.buildPacket).to.be.a('function');
    });
  });


  describe('buildPacket', function () {
    var reliableServer = reliableServerConstructor(),
        sid = '123', data = 'test', session;

    reliableServer.sessions[sid] = session = {};
    session.packetCount = 0,
    session.writeBuffer = [];

    reliableServer.buildPacket(data, sid);
    it('should increment the packetCount', function() {
      expect(session.packetCount).to.be(1);
    });

    it('should add the new packet', function() {
      expect(session.writeBuffer.length).to.be(1);
      var jsonBuffer = JSON.stringify(session.writeBuffer[0]);
      expect(jsonBuffer).to.be('[1,"test"]');
    });
  });

  describe('getSession', function() {
    var reliableServer = reliableServerConstructor(),
        sid = '123', tid = '321', tdata = 'test',
        sdata = 'tset';

    reliableServer.temp_sessions[tid] = tdata;
    reliableServer.sessions[sid] = sdata;

    var tsocket = {_tid: tid},
        ssocket = {_sid: sid};

    it('should get the correct session', function() {
      expect(reliableServer.getSession(tsocket)).to.be(tdata);
      expect(reliableServer.getSession(ssocket)).to.be(sdata);
    })
  })

  describe('onOpen', function() {
    var reliableServer = reliableServerConstructor(),
        tid = '123', data = ['test', 'tset'],
        sentData = [[1,'test'],[2,'tset']],
        seenObj = {1: true, 2:true};

    reliableServer.temp_sessions = {
      '123': {
        seenObj: seenObj,
        lastSeen: 2,
        writeBuffer: data
      }
    };
    var socket = {
      _tid: tid,
      _sendBuffer: [],
      _send: function(string) {
        this._sendBuffer.push(string);
      }
    }

    reliableServer.onOpen(socket);
    it('should set a new session id', function() {
      expect(socket._sid).to.be.a('string');
    })
    it('should send data correctly', function() {
      var sendBuffer = socket._sendBuffer;
      expect(sendBuffer.length).to.be(2);
      expect(sendBuffer[0]).to.be(
        parser.encodePacket({type: 'sid', data: socket._sid}));
      expect(sendBuffer[1]).to.be(
        parser.encodePacket({type: 'message', data: sentData}));
    })
    it('should set the new session correctly', function() {
      var session = reliableServer.sessions[socket._sid];
      expect(session.socket).to.be(socket);
      expect(session.packetCount).to.be(2);
      expect(jstring(session.writeBuffer)).to.be(jstring(sentData));
      expect(session.seenObj).to.be(seenObj);
      expect(session.lastSeen).to.be(2);
    })
  });

  describe('onAck', function() {
    var reliableServer = reliableServerConstructor(),
    sid = '123', data = [[1, 'test'],[2, 'tset']], id = '2',
    socket = {_sid: sid}, session;

    reliableServer.sessions[sid] = session = {writeBuffer: data};

    reliableServer.onAck({_sid: sid}, id);
    it('should remove the correct packet', function() {
      expect(session.writeBuffer.length).to.be(1);
      expect(session.writeBuffer[0]).to.be(data[0]);
    });
  });

  describe('onRecon', function() {
    var reliableServer = reliableServerConstructor();
    // TODO
  })

  describe('onMessage', function() {
    var reliableServer = reliableServerConstructor();
    // TODO
  })

  describe('overrideSend', function() {
    var reliableServer = reliableServerConstructor();
    // TODO
  })

  describe('overrideOnData', function() {
    var reliableServer = reliableServerConstructor();
    // TODO
  })

  describe('flushTempSession', function() {
    var reliableServer = reliableServerConstructor(),
        tid = '123', sid = '321', data = ['test', 'tset'],
        sentData = [[1,'test'],[2,'tset']];

    reliableServer.temp_sessions[tid] = {writeBuffer: data};
    reliableServer.sessions[sid] = {writeBuffer: [], packetCount: 0};
    var socket = {
      _tid: tid,
      _sid: sid,
      _sendBuffer: [],
      _send: function(string) {
        this._sendBuffer.push(string);
      }
    }

    reliableServer.flushTempSession(socket);
    it('should send data correctly', function() {
      var sendBuffer = socket._sendBuffer;
      expect(sendBuffer.length).to.be(1);
      expect(sendBuffer[0]).to.be(
        parser.encodePacket({type: 'message', data: sentData}));
    })
  })
  
});