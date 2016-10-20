var Rudeplay = null,
    dgram    = require('dgram'),
    Blast    = __Protoblast,
    util     = require('util'),
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Client Timing server class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Develry.Rudeplay.Client.Device}   device   The device we'll connect to
 */
var Timing = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function TimingServer(device) {

	var that = this;

	// Store the main client instance
	this.client = device.client;

	// Store the device
	this.device = device;

	// Create a dgram server
	this.server = dgram.createSocket(this.client.socket_type);

	// The port will go here
	this.port = null;

	// Listen to timing server requests
	this.server.on('message', function gotTimingMessage(msg, rinfo) {

		var ntpTime,
		    reply,
		    ts1,
		    ts2;

		if (Blast.DEBUG) {
			Rudeplay.log('Got Timing request message: ' + msg);
		}

		ts1 = msg.readUInt32BE(24);
		ts2 = msg.readUInt32BE(28);

		reply = new Buffer(32);
		reply.writeUInt16BE(0x80d3, 0);
		reply.writeUInt16BE(0x0007, 2);
		reply.writeUInt32BE(0x00000000, 4);

		reply.writeUInt32BE(ts1, 8);
		reply.writeUInt32BE(ts2, 12);

		ntpTime = that.client.ntp.timestamp();

		ntpTime.copy(reply, 16);
		ntpTime.copy(reply, 24);

		that.server.send(
			reply,
			0,
			reply.length,
			rinfo.port,
			rinfo.address
		);
	});

	// Bind to a random port
	this.server.bind(function bound() {
		var addr = that.server.address();

		if (Blast.DEBUG) {
			Rudeplay.log('Client Timing server listening', addr.port);
		}

		that.port = addr.port;

		that.emit('ready', addr.port);
		that.emit('done', null, addr.port);
	});
});

/**
 * Destroy the server
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Timing.setMethod(function destroy() {
	this.server.close();
});

module.exports = Timing;