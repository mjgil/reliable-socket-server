var reliableServerConstructor = require('../index'),
	expect = require('expect.js'),
	parser = require('reliable-socket-protocol');

describe('reliable-server', function () {
  it('should be a function', function() {
    expect(reliableServerConstructor).to.be.a('function');
  })

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
  })
})