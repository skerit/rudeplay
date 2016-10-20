var Rudeplay = null,
    counter  = 0,
    dgram    = require('dgram'),
    Blast    = __Protoblast,
    util     = require('util'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Client RTP Control server class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Develry.Rudeplay.Client.Device}   device
 */
var RtpControl = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function RtpControlServer(device) {

	var that = this;

	// Store the main client instance
	this.client = device.client;

	// Store the device
	this.device = device;

	// Create a dgram server
	this.server = dgram.createSocket(this.client.socket_type);

	// The port will go here
	this.port = null;

	// Listen to control messages
	this.server.on('message', function gotRtpMessage(msg, remote_info) {

		// @TODO: implement
		var serverSeq = msg.readUInt16BE(2);
		var missedSeq = msg.readUInt16BE(4);
		var count = msg.readUInt16BE(6);
	});

	if (Blast.DEBUG) {
		Rudeplay.log('Binding RtpControlServer...');
	}

	// Bind to a random port
	this.server.bind(function bound() {
		var addr = that.server.address();

		if (Blast.DEBUG) {
			Rudeplay.log('RTP Control server listening', addr.port);
		}

		that.port = addr.port;

		that.emit('ready', addr.port);
		that.emit('done', null, addr.port);
	});
});

/**
 * Send sync command
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
RtpControl.setMethod(function sendSync(seq, dev) {

	// @TODO: check if server is bound?

	var ntp_time,
	    packet;

	packet.writeUInt16BE(0x80d4, 0);
	packet.writeUInt16BE(0x0007, 2);
	packet.writeUInt32BE(low32(seq * this.client.frames_per_packet), 4);

	ntp_time = this.client.ntp.timestamp();
	ntp_time.copy(packet, 8);

	packet.writeUInt32BE(low32(seq*this.client.frames_per_packet + this.client.sampling_rate*2), 16);

	// @TODO: DEV is not needed, since this server is device specific?
	this.server.send(packet, 0, packet.length, dev.controlPort, dev.host);
});

/**
 * Destroy the server
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
RtpControl.setMethod(function destroy() {
	this.server.close();
});

function low32(i) {
	return i % 4294967296;
}

module.exports = RtpControl;