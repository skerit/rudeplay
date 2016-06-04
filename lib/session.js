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

	// Last active
	this.last_active = Date.now();

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

	// Create new stream sequence
	this.rtsp_sequence = new Rudeplay.RtspSequenceStream(this);

	this._control_seq_nr = 0;

	// Re-request missing packets
	this.rtsp_sequence.on('missing', this._retransmit.bind(this));

	this.speaker = new Speaker({
		channels: 2,          // 2 channels 
		bitDepth: 16,         // 16-bit samples 
		sampleRate: 44100     // 44,100 Hz sample rate 
	});

	// var test = fs.createWriteStream('test.wav');
	// pass.write(body);
	// test.write(body);

	console.log(' -- NEW SESSION --', this);
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

	console.log('Looking for session of', req);

	if (req.headers['session'] && sessions[req.headers['session']]) {
		result = sessions[req.headers['session']];

		// @TODO: if session header is defined, but not found,
		// an error response should be returned
	} else {

		for (key in sessions) {
			session = sessions[key];

			console.log('Comparing to session req', session.original_req);

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
 */
Session.setMethod(function _retransmit(seq) {

	var that = this,
	    client,
	    buf;

	buf = new Buffer(8);
	buf.writeUInt8(128, 0);
	buf.writeUInt8(128 + 85, 1); // 85 = retransmit query
	buf.writeUInt16BE(this._control_seq_nr++, 2);
	buf.writeUInt16BE(seq, 4);
	buf.writeUInt16BE(1, 6);

	// Create a new udp socket
	client = dgram.createSocket('udp4');

	var t = new Buffer(2);
	t.writeUInt16BE(seq);

	console.log('Requesting client to re-transmit', seq, '(' + t[0] + t[1] + ')', 'as control nr', this._control_seq_nr-1);
	console.log('To', this.transport.control_port, this.rtp_server.remote_info.address);

	// TEST: most clients never respond, so just drop it
	setImmediate(function() {
		that.addSequence(seq, null);
	});

	// Send the request to the client
	client.send(buf, 0, 8, this.transport.control_port, this.rtp_server.remote_info.address, function sent(err) {

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

// Clear old sessions
setInterval(function clearOldSessions() {
	// @TODO
}, 60 * 1000);

module.exports = Session;