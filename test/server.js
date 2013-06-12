var reliableServerConstructor = require('../index'),
  expect = require('expect.js'),
  parser = require('reliable-socket-protocol');

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
  
});