var Rudeplay = null,
    counter  = 0,
    stream   = require('stream'),
    dgram    = require('dgram'),
    Blast    = __Protoblast,
    util     = require('util'),
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The RTP server class
 * Actual media data will be sent to this server
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Incoming}   req   The incoming request
 */
var RtpServer = Fn.inherits('Informer', 'Develry.Rudeplay', function RtpServer(req) {

	var that = this,
	    marker = true,
	    conf;

	// Store the main server instance
	this.rudeplay = req.connection.rudeplay;

	// Store the connection
	this.connection = req.connection;

	// Original request
	this.req = req;

	// Store this in the session
	req.session.setRtpServer(this);

	// Remote info goes here later
	this.remote_info = null;

	// Create a dgram server
	this.server = dgram.createSocket('udp4');

	// Listen for messages
	this.server.on('message', function gotRtpMessage(msg, remote_info) {

		var body,
		    seq;

		if (marker) {
			that.remote_info = remote_info;
			marker = false;
		}

		if (!conf) {
			conf = req.session.get('sdp_conf');
		}

		if (!conf) {
			throw new Error('Could not find SDP configuration for decrypting incoming RTP data');
		}

		seq = msg.readUInt16BE(2);
		body = that.rudeplay.decryptData(msg, conf.aeskey, conf.aesiv);

		req.session.addSequence(seq, body);
	});

	// Original port: 53561
	// Bind to any available port
	this.server.bind(function bound() {
		var addr = that.server.address();

		console.log('RTP server listening', addr.port);

		that.emit('ready', addr.port);
		that.emit('done', null, addr.port);
	});
});

/**
 * The session property
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type     {Session}
 */
RtpServer.setProperty(function session() {
	return this.req.session;
});

module.exports = RtpServer;