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
 * @version  0.1.2
 *
 * @param    {Incoming}   req   The incoming request
 */
var RtpControl = Fn.inherits('Informer', 'Develry.Rudeplay.Server', function RtpControlServer(req) {

	var that = this,
	    port,
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
		    next_seq,
		    body,
		    seq,
		    now,
		    cb;

		// Get the payload type number
		payload_type = msg.readUInt8(1) & 127;

		if (conf == null) {
			conf = req.session.get('sdp_conf');
		}

		if (Blast.DEBUG) {
			Rudeplay.log('Got RTP Control payload of type', payload_type);
		}

		switch (payload_type) {

			// TIME SYNC packets
			case 84:

				if (Blast.DEBUG) {
					Rudeplay.log('TIME SYNC PACKET:', msg);
				}

				// SYNC packets seq nr is always 0007 or 0004

				// RTP "now" time minus latency
				now_minus_latency = msg.readUInt32BE(4);

				// NTP time in seconds
				time_last_sync = msg.readUInt32BE(8);

				// NTP fraction time
				time_last_sync_frac = msg.readUInt32BE(12);

				// RTP "now" time
				now = msg.readUInt32BE(16);

				if (!req.session.initial_rtp_timestamp) {

					if (Blast.DEBUG) {
						// @TODO: still could use this now_minus_latency info, though
						Rudeplay.log(port, 'Initial RTP timestamp not yet set, not setting next sequence!');
					}

					return;
				}

				// Calculate the sequence that should be playing next
				// @TODO: The amount of frames can depend on the session, isn't always 352
				next_seq = ~~((now_minus_latency - req.session.initial_rtp_timestamp) / 352) + req.session.initial_seq_timestamp;
				next_seq = next_seq % 65535;

				console.log('CONTROL:', now_minus_latency, '-', req.session.initial_rtp_timestamp, '/', 352, '=', next_seq)

				if (next_seq < 0) {
					if (Blast.DEBUG) {
						Rudeplay.log('Port', port, 'Next sequence to play is smaller than 0:', next_seq, 'Initial timestamp:', req.session.initial_rtp_timestamp, 'Now:', now_minus_latency);
					}

					return;
				}

				// And tell the sequence stream to play it!
				req.session.rtsp_sequence.setNextSequence(next_seq);

				if (Blast.DEBUG) {
					Rudeplay.log(port, 'NextSeq', next_seq, 'NOWLatency', now_minus_latency, 'LastSync', time_last_sync, time_last_sync_frac, 'NOW', now);
				}

				break;

			// Audio data resends
			case 86:

				// Get the sequence number
				seq = msg.readUInt16BE(6);

				if (Blast.DEBUG) {
					Rudeplay.log('Got re-transmit sequence!', seq);
				}

				// Decrypt the actual body
				if (conf.aeskey) {
					// Decrypt the data (and slice of the header, which is 16 bytes in this case)
					body = that.rudeplay.decryptData(msg, conf.aeskey, conf.aesiv, 16);
				} else {
					// Just slice of the 16 byte header
					body = msg.slice(16);
				}

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

		port = addr.port;
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