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
 * @version  0.1.1
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

	// The initial RTP timestamp number
	// This is always given to us by the client, and is a random number
	this.initial_rtp_timestamp = 0;

	// Sequence number corresponding to the initial timestamp
	this.initial_seq_timestamp = 0;

	// Is this an ipv6 connection?
	this.is_ipv6 = false;

	// Re-transmit callbacks
	this.retransmit_callbacks = new Map();

	this._control_seq_nr = 1;

	// Create a speaker instance
	this.speaker = new Speaker({
		channels: 2,          // 2 channels 
		bitDepth: 16,         // 16-bit samples 
		sampleRate: 44100     // 44,100 Hz sample rate 
	});

	// Create an RTSP sequence stream
	this.recreateRtspSequence();

	if (Blast.DEBUG) {
		Rudeplay.log('Created session', this.id);
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
 * Get the framelength
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type     {Number}
 */
Session.setProperty(function framelength() {

	if (this.values.sdp_conf && this.values.sdp_conf.alac) {
		return this.values.sdp_conf.alac.frameLength || 352;
	}

	return 352;
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
 * Reset the session, called by TEARDOWN request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 */
Session.setMethod(function reset() {

	// We don't have to destroy the session,
	// the stream just needs to stop playing
	// The session queue also needs to be reset
	this.recreateRtspSequence();

	// Reset the initial timestamps
	this.initial_rtp_timestamp = 0;
	this.initial_seq_timestamp = 0;
});

/**
 * Create a new Rtsp Sequence stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Session.setMethod(function recreateRtspSequence() {

	var that = this;

	// If there is a current sequence, reset it
	if (this.rtsp_sequence) {
		// Reset the existing stream's sequence queue
		this.rtsp_sequence._sequeue.reset();
	}

	// Destroy any existing request queues
	if (this.request_queue) {
		this.request_queue.destroy();
	}

	// Create a new function queue
	// Allow 10 concurrent requests, throttle new ones at 5ms
	// Without a queue, requests were made at +/- 25/s, and it couldn't keep up
	this.request_queue = Fn.createQueue({limit: 10, throttle: 5, enabled: true});

	// Create new stream sequence
	this.rtsp_sequence = new Rudeplay.RtspSequenceStream(this, {timeout: this.rudeplay.retransmit_timeout});

	// Re-request missing packets
	this.rtsp_sequence.on('missing', function onMissing(seq, callback) {
		// Schedule this request
		that.request_queue.add(function doRequest(next) {
			// Next is called when request has been sent,
			// callback will receive the actual response
			that._retransmit(seq, next, callback);
		});
	});
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
 * @version  0.1.1
 *
 * @param    {Number}   seq                 The sequence number to request
 * @param    {Function} sent_callback       Function to call when request has been sent
 * @param    {Function} response_callback   Function to call with response
 */
Session.setMethod(function _retransmit(seq, sent_callback, response_callback) {

	var that = this,
	    control_nr,
	    client,
	    buf;

	// Get the control number
	//control_nr = this._control_seq_nr++;

	buf = new Buffer(8);

	// The marker is always on: 0x80
	buf.writeUInt8(128, 0);

	// 85 = Apple 'retransmit' query
	// 0xd5
	buf.writeUInt8(128 + 85, 1);

	// The sequence number is always 1,
	// so control_nr is no longer needed?
	buf.writeUInt16BE(1, 2);

	// Actual sequence number we need
	buf.writeUInt16BE(seq, 4);

	// Count of sequences we need
	buf.writeUInt16BE(1, 6);

	// Buffer example of re-requesting seq 22503 as control 0
	// <Buffer 80 d5 00 00 57 e7 00 02>

	if (Blast.DEBUG) {
		Rudeplay.log('Requesting client to re-transmit', seq);
	}

	this.retransmit_callbacks.set(seq, response_callback);

	// It is important to send the retransmit request from the same port as the one you're receiving the responses on
	// Itunes and such will IGNORE the control_port you originally told it about, and send the retransmit response
	// to the same port as from where the query was made.
	this.rtp_control_server.server.send(buf, 0, 8, this.client_transport.control_port, this.rtp_server.remote_info.address, sent_callback);
});

/**
 * Set Rtp info
 * Should be received on a RECORD request (to set up info, though it isn't)
 * and on a FLUSH request (to pause it)
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

	this.setInitialTimestamp(Number(info.rtptime))

	// Set the general info
	this.rtp_info = info;

	if (Blast.DEBUG) {
		Rudeplay.log('RTP info:', info, 'initial RTP time:', this.intial_rtp_timestamp);
	}
});

/**
 * Set the initial RTP timestamp
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Number}   time   The initial RTP timestamp
 * @param    {Number}   seq    The optional seq number corresponding to it
 */
Session.setMethod(function setInitialTimestamp(time, seq) {

	// Initial timestamp can't be 0 or anything false
	if (!time) {
		return;
	}

	if (Blast.DEBUG) {
		Rudeplay.log('Setting initial timestamps:', time, 'Seq:', seq);
	}

	// Set the initial timestamp
	this.initial_rtp_timestamp = time;

	if (seq) {
		this.initial_seq_timestamp = seq;
	}
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
		Rudeplay.log('Destroying session', this.id);
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