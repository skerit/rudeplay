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
 * @param    {Develry.Rudeplay.Client.Session}   session
 */
var RtpControl = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function RtpControlServer(session) {

	var that = this;

	// Store the session
	this.session = session;

	// And the client
	this.client = session.client;

	// Store the device
	this.device = session.device;

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
 * Send timing sync command
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
RtpControl.setMethod(function sendSync(seq, rtp_timestamp, dev) {

	// @TODO: check if server is bound?

	var ntp_time,
	    packet;

	packet = new Buffer(20);

	// Time sync packets are of type 84
	packet.writeUInt16BE(0x80d4, 0);

	// Used to be 0x0007, but NTO Airplay spec says 0x0004
	packet.writeUInt16BE(0x0004, 2);

	// Add the "now_minus_latency"
	// @TODO: subtract the latency?
	packet.writeUInt32BE(Rudeplay.low32(rtp_timestamp), 4);

	// Add the current ntp time
	ntp_time = this.client.ntp.timestamp();

	// Add the current timestamp
	ntp_time.copy(packet, 8);

	// Add the "now" rtp timestamp for the next packet
	packet.writeUInt32BE(Rudeplay.low32(rtp_timestamp), 12);

	if (Blast.DEBUG) {
		Rudeplay.log('Server should play sequence', seq, 'next');
	}

	// @TODO: DEV is not needed, since this server is device specific?
	this.server.send(packet, 0, packet.length, this.session.transport_info.control_port, this.device.host);
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

module.exports = RtpControl;