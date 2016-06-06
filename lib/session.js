var id_count = 0,
    sessions = {},
    Rudeplay = null,
    stream   = require('stream'),
    Blast    = __Protoblast,
    dgram    = require('dgram'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

var Speaker = require('speaker');

/**
 * The Session class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Incoming}   req   The incoming request
 */
var Session = Fn.inherits('Informer', 'Develry.Rudeplay', function Session(req) {

	var that = this;

	// Store the connection that created the session
	this.connection = req.connection;

	// Store the main server instance
	this.rudeplay = req.connection.rudeplay;

	// Store the original request
	this.original_req = req;

	// Store the session id
	this.id = String(~~(Date.now() / 1000)) + String(id_count++);

	// Stored values
	this.values = {};

	// Store this session
	sessions[this.session_id] = this;

	// Specific RTP info, received through RECORD
	this.rtp_info = null;

	// Server instances will go here later
	this.rtp_server = null;
	this.rtp_control_server = null;
	this.timing_server = null;

	// Is this an ipv6 connection?
	this.is_ipv6 = false;

	// Re-transmit callbacks
	this.retransmit_callbacks = new Map();

	this._control_seq_nr = 0;

	// Create a speaker instance
	this.speaker = new Speaker({
		channels: 2,          // 2 channels 
		bitDepth: 16,         // 16-bit samples 
		sampleRate: 44100     // 44,100 Hz sample rate 
	});

	// Create an RTSP sequence stream
	this.recreateRtspSequence();

	if (Blast.DEBUG) {
		console.log('Created session', this.id);
	}
});

/**
 * See if this request has a session somewhere
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Incoming}   req
 */
Session.setStatic(function getSession(req) {

	var session,
	    result,
	    key;

	if (req.headers['session'] && sessions[req.headers['session']]) {
		result = sessions[req.headers['session']];

		// @TODO: if session header is defined, but not found,
		// an error response should be returned
	} else {

		for (key in sessions) {
			session = sessions[key];

			if (req.headers['dacp-id']) {
				if (session.original_req.headers['dacp-id'] == req.headers['dacp-id']) {
					result = session;
					break;
				}
			}

			if (req.headers['active-remote']) {
				if (session.original_req.headers['active-remote'] == req.headers['active-remote']) {
					result = session;
					break;
				}
			}

			if (req.headers['client-instance']) {
				if (session.original_req.headers['client-instance'] == req.headers['client-instance']) {
					result = session;
					break;
				}
			}
		}
	}

	return result;
});

/**
 * Get the socket type
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type     {String}
 */
Session.setProperty(function socket_type() {
	if (this.is_ipv6) {
		return 'udp6';
	} else {
		return 'udp4';
	}
});

/**
 * Create a new Rtsp Sequence stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Session.setMethod(function recreateRtspSequence() {

	// If there is a current sequence, reset it
	if (this.rtsp_sequence) {
		// Reset the existing stream's sequence queue
		this.rtsp_sequence._sequeue.reset();
	}

	// Create new stream sequence
	this.rtsp_sequence = new Rudeplay.RtspSequenceStream(this);

	// Re-request missing packets
	this.rtsp_sequence.on('missing', this._retransmit.bind(this));
});

/**
 * Add a chunk to the RTSP sequence stream
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Number}   seq
 * @param    {Buffer}   chunk
 */
Session.setMethod(function addSequence(seq, chunk) {
	return this.rtsp_sequence.add(seq, chunk);
});

/**
 * Create an AlacDecoder stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @return   {AlacDecoderStream}
 */
Session.setMethod(function createAlacDecoder() {

	// Create the decoder stream
	this.alac_decoder_stream = new Rudeplay.AlacDecoderStream(this);

	// Pipe the decoder into the speaker
	this.alac_decoder_stream.pipe(this.speaker);

	// Pipe the RTSP sequence output into the ALAC decoder
	this.rtsp_sequence.pipe(this.alac_decoder_stream);

	return this.alac_decoder_stream;
});

/**
 * Request sequence retransmit
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Number}   seq
 * @param    {Function} callback
 */
Session.setMethod(function _retransmit(seq, callback) {

	var that = this,
	    control_nr,
	    client,
	    buf;

	// Get the control number
	control_nr = this._control_seq_nr++;

	buf = new Buffer(8);
	buf.writeUInt8(128, 0);

	// 85 = Apple 'retransmit' query
	buf.writeUInt8(128 + 85, 1);

	// Our sequence number
	buf.writeUInt16BE(control_nr, 2);

	// Actual sequence number we need
	buf.writeUInt16BE(seq, 4);

	// Count of sequences we need
	buf.writeUInt16BE(1, 6);

	// Create a new udp socket of the correct type (udp4 or udp6)
	client = dgram.createSocket(this.socket_type);

	if (Blast.DEBUG) {
		console.log('Requesting client to re-transmit', seq, 'as control nr', control_nr, 'to', this.client_transport.control_port, this.rtp_server.remote_info.address);
	}

	this.retransmit_callbacks.set(seq, callback);

	// Send the request to the client
	client.send(buf, 0, 8, this.client_transport.control_port, this.rtp_server.remote_info.address, function sent(err) {

		if (err) {
			throw err
		}
	});
});

/**
 * Set Rtp info
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String|Object}   info   String coming from request headers, or object
 */
Session.setMethod(function setRtpInfo(info) {

	// Turn the info into an object
	if (typeof info == 'string') {
		info = this.rudeplay.splitHeaderLine(info);
	}

	// Get the sequence number
	info.seq = parseInt(info.seq, 10);

	this.rtp_info = info;
});

/**
 * Set Rtp server
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Session.setMethod(function setRtpServer(server) {
	this.rtp_server = server;
});

/**
 * Set Rtp Control server
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Session.setMethod(function setRtpControlServer(server) {
	this.rtp_control_server = server;
});

/**
 * Set a value in the session
 *
 * @author   Thomas Watson Steen  <w@tson.dk> 
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Session.setMethod(function set(name, value) {

	if (name == 'decoder') {
		this.alac_decoder = value;

		// Forward the decoder output
		this.alac_decoder.pipe(this.alac_output);
	}

	this.values[name] = value;
});

/**
 * Set a value from the session
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Session.setMethod(function get(name) {
	return this.values[name];
});

/**
 * Destroy this session
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Session.setMethod(function destroy() {

	if (Blast.DEBUG) {
		console.log('Destroying session', this.id);
	}

	// Delete the session entry
	delete sessions[this.id];

	// Destroy the udp servers
	if (this.rtp_server) {
		this.rtp_server.destroy();
	}

	if (this.rtp_control_server) {
		this.rtp_control_server.destroy();
	}

	if (this.timing_server) {
		this.timing_server.destroy();
	}

	// Close the speaker
	this.speaker.close();
});

module.exports = Session;