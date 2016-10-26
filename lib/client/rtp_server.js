var Rudeplay = null,
    stream   = require('stream'),
    dgram    = require('dgram'),
    Blast    = __Protoblast,
    util     = require('util'),
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

const RTP_HEADER_SIZE = 12;

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
 * Send data to the server
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
RtpServer.setMethod(function send(packet, require_encryption) {

	var rtp_timestamp,
	    result,
	    header,
	    seq;

	if (require_encryption) {
		// @TODO: encrypt!
	}

	// Get the packet sequence
	seq = this.session.getPacketSequence();

	// And the timestamp
	rtp_timestamp = this.session.getRtpTimestamp();

	header = this.makeRtpHeader(packet, rtp_timestamp, seq);

	result = new Buffer(packet.length + RTP_HEADER_SIZE);

	// Copy the header into the result packet
	header.copy(result);

	// And add the rest
	packet.copy(result, RTP_HEADER_SIZE);

	// Send the packet
	this.server.send(result, 0, result.length, this.session.server_port, this.device.host);

	if (!this.synced) {
		this.synced = true;
		this.sendSync();
		//this.session.rtp_control_server.sendSync(seq, rtp_timestamp)
	}

	// Increment the seq & timestamps
	this.session.incrementPacketSequence();
	this.session.incrementRtpTimestamp();
});

/**
 * Send sync to the server
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
RtpServer.setMethod(function sendSync() {

	var current_seq,
	    session = this.session,
	    elapsed,
	    time;

	// Number of elapsed seconds
	elapsed = session.convertUnixToRtp() - session.play_start;

	// The sequence we should be playing
	current_seq = Math.floor(elapsed*44100/(352)) + session.packet_ref;

	// The timestamp we should be playing
	time = ((elapsed * 352 * 128) + session.rtp_time_ref);

	console.log('Should be playing:', current_seq, 'Elapsed:', elapsed, 'Time:', time, 'Othertp:', session.getRtpTimestamp())
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

	var header = new Buffer(RTP_HEADER_SIZE);

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