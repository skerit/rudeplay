var Rudeplay = null,
    counter  = 0,
    dgram    = require('dgram'),
    Blast    = __Protoblast,
    util     = require('util'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The RTP Control server class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @param    {Incoming}   req   The incoming request
 */
var RtpControl = Fn.inherits('Informer', 'Develry.Rudeplay', function RtpControlServer(req) {

	var that = this,
	    conf;

	// Original request
	this.req = req;

	// Store the main server instance
	this.rudeplay = req.connection.rudeplay;

	// Store the session
	this.session = req.session

	// Store this in the session
	this.session.setRtpControlServer(this);

	// Create a dgram server
	this.server = dgram.createSocket(this.session.socket_type);

	// Listen to control messages
	this.server.on('message', function gotRtpMessage(msg, remote_info) {

		var time_last_sync_frac,
		    now_minus_latency,
		    time_last_sync,
		    payload_type,
		    body,
		    seq,
		    now,
		    cb;

		// Get the payload type number
		payload_type = msg.readUInt8(1) & 127;

		if (conf == null) {
			conf = req.session.get('sdp_conf');
		}

		switch (payload_type) {

			// TIME SYNC packets
			case 84:

				// We're ignoring these, for now
				return;

				// SYNC packets seq nr is always 0007 or 0004
				now_minus_latency = msg.readUInt32BE(4);
				time_last_sync = msg.readUInt32BE(8);
				time_last_sync_frac = msg.readUInt32BE(12);
				now = msg.readUInt32BE(16);

				Rudeplay.log('SYNC:', now_minus_latency, 'Last sync:', time_last_sync, time_last_sync_frac, 'NOW:', now);
				break;

			// Audio data resends
			case 86:

				// Get the sequence number
				seq = msg.readUInt16BE(6);

				if (Blast.DEBUG) {
					Rudeplay.log('Got re-transmit sequence!', seq);
				}

				// Decrypt the actual body
				body = that.rudeplay.decryptData(msg, conf.aeskey, conf.aesiv, 16);

				// Get the callback from the session
				cb = that.session.retransmit_callbacks.get(seq);

				if (cb) {
					cb(null, body);
				}

				break;

			default:
				Rudeplay.log('UNKNOWN CONTROL MESSAGE:', payload_type, msg);
		}
	});

	// Original port: 63379
	this.server.bind(function bound() {
		var addr = that.server.address();

		if (Blast.DEBUG) {
			Rudeplay.log('RTP Control server listening', addr.port);
		}

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
RtpControl.setProperty(function session() {
	return this.req.session;
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