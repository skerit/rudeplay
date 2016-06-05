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
 * @version  0.1.0
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

		var payload_type,
		    body,
		    seq,
		    cb;

		// Get the payload type number
		payload_type = msg.readUInt8(1) & 127;

		switch (payload_type) {

			// Sync, nobody seems to do anything with this
			case 84:
				break;

			// Audio data resends
			case 86:
			case 96:
				// Different type numbers need slightly different implementations:
				//https://github.com/abrasive/shairport/blob/master/rtp.c

				// Get the sequence number
				seq = msg.readUInt16BE(6);

				console.log('Got re-transmit sequence!!', seq);

				if (conf == null) {
					conf = req.session.get('sdp_conf');
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
				console.log('UNKNOWN CONTROL MESSAGE:', payload_type, msg);
		}
	});

	// Original port: 63379
	this.server.bind(function bound() {
		var addr = that.server.address();

		console.log('RTP Control server listening', addr.port);

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

module.exports = RtpControl;