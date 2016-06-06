var Rudeplay = null,
    counter  = 0,
    stream   = require('stream'),
    dgram    = require('dgram'),
    Blast    = __Protoblast,
    util     = require('util'),
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

function debug() {
	console.log.apply(console, arguments);
}

/**
 * The RtspSequenceStream class
 *
 * @author   Thomas Watson Steen  <w@tson.dk>
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Session}   session
 * @param    {Object}    options
 */
var RtspSequence = Fn.inherits(stream.Readable, 'Develry.Rudeplay', function RtspSequenceStream(session, options) {

	var that = this;

	// The ALAC decoder reading the audio data from this stream needs to get the
	// audio packets in the same size as we received them. We therefore enable
	// object mode on this stream so that we can ensure that no internal
	// buffer-concatenation goes on inside the Readable stream.
	stream.Readable.call(this, {objectMode: true, highWaterMark: 1000});

	// Store the session
	this._session = session;

	// Create an internal queue,
	// where we store chunks in as long as we can't flow
	this._queue = [];

	// Create a new sequence queue
	this._sequeue = new Rudeplay.Queue();

	// Wait at most 1 second for a missing packet
	this._sequeue.setMissingTimeout(1000);

	// Do something with the values
	this._sequeue.setForwardFunction(function doForward(nr, value) {
		that._push(value);
	});

	// Set the request function
	this._sequeue.setRequestFunction(function doRequest(nr, callback) {
		// Re-request the sequence
		that.emit('missing', nr, callback);
	});

	// Listen to timeouts, so we can remove the callback waiting for it
	this._sequeue.on('timeout', function onTimeout(nr, ms) {

		if (Blast.DEBUG) {
			console.log('Did not receive', nr, 'in', ms, 'ms');
		}

		if (session.retransmit_callbacks.has(nr)) {
			session.retransmit_callbacks.delete(nr);
		}
	});
});

/**
 * Add a sequence chunk
 *
 * @author   Thomas Watson Steen  <w@tson.dk>
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Number}   seq
 */
RtspSequence.setMethod(function add(seq, chunk) {

	var that = this,
	    rtp_info;

	// If the first number isn't set yet,
	// see if we already know what it should be
	if (this._sequeue._first == null) {
		// Get the rtpInfo, should have been sent as a header
		// in a RECORD method
		rtp_info = this._session.rtp_info;

		if (rtp_info) {
			this._sequeue.setFirst(rtp_info.seq);
		}
	}

	this._sequeue.push(seq, chunk);
});

/**
 * Push a chunk
 *
 * @author   Thomas Watson Steen  <w@tson.dk>
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   chunk
 */
RtspSequence.setMethod(function _push(chunk) {
	if (this._flowing) {
		var result = this.push(chunk);

		if (!result) {
			debug('back pressure detected!');
			this._flowing = false
		}

		return result;
	} else {
		this._queue.push(chunk);
	}
});

/**
 * Read
 *
 * @author   Thomas Watson Steen  <w@tson.dk>
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
RtspSequence.setMethod(function _read() {

	var chunk;
	this._flowing = true

	if (!this._flowing) {
		debug('entering flowing mode...');
	}

	this._flowing = true

	if (this._queue.length === 0) {
		return;
	}

	while ((chunk = this._queue.shift()) !== null) {
		if (!this._push(chunk)) {
			return;
		}
	}
});

module.exports = RtspSequence;