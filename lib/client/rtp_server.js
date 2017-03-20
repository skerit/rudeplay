var Rudeplay = null,
    stream   = require('stream'),
    dgram    = require('dgram'),
    Blast    = __Protoblast,
    util     = require('util'),
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Client RTP server class
 * Actual media data will be sent from this server
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Develry.Rudeplay.Client.Session}   session
 */
var RtpServer = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function RtpServer(session) {

	var that = this;

	// Store the main client instance
	this.client = session.client;

	// Store the device
	this.device = session.device;

	// And the session
	this.session = session;

	// Create a dgram server
	this.server = dgram.createSocket(this.client.socket_type);

	// The port will go here
	this.port = null;

	// Has been synced?
	this.synced = false;

	// Force a sync every second
	// @TODO: destroy on end
	setInterval(function forceSync() {
		that.sendSync();
	}, 1000);
});

/**
 * Header size
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
RtpServer.setProperty('RTP_HEADER_SIZE', 12);

/**
 * Send data to the server
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
RtpServer.setMethod(function send(packet, require_encryption) {

	var result;

	if (require_encryption) {
		// @TODO: encrypt!
	}

	result = packet.result;

	// Send the packet
	this.server.send(result, 0, result.length, this.session.server_port, this.device.host);
});

/**
 * Tell the server which packet it should be playing
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
RtpServer.setMethod(function sendSync() {

	var current_seq,
	    session = this.session,
	    time;

	// The sequence we should be playing
	current_seq = session.getPlayingSequence();

	// The timestamp we should be playing
	time = ((current_seq - session.packet_ref) * 352) + session.rtp_time_ref; //  + (45 * 352)

	session.rtp_control_server.sendSync(current_seq, time);
});

/**
 * Make an RTP header buffer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
RtpServer.setMethod(function makeRtpHeader(packet, timestamp, seq) {

	var header = new Buffer(this.RTP_HEADER_SIZE);

	if (seq === 0) {
		header.writeUInt16BE(0x80e0, 0);
	} else {
		header.writeUInt16BE(0x8060, 0);
	}

	header.writeUInt16BE(Rudeplay.low16(seq), 2);
	header.writeUInt32BE(Rudeplay.low32(timestamp), 4);
	header.writeUInt32BE(this.session.device_magic, 8);

	return header;
});