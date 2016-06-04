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

	this._session = session;
	this._first_seq = null;
	this._last_seq = null;
	this._flowing = false;
	this._queue = [];
	this._unorderd = [];
	this._queued_seq = [];
	this._have_unordered = false;
});

var prev = 0;
var halt = Infinity;

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

	if (halt < 0) {
		return;
	}

	if (seq != prev +1) {
		console.log('Skipped a sequence!');
		//halt = 6;
	}

	halt--;

	prev = seq;

	console.log('Pushing chunk', seq, 'of length', chunk.length);

	if (chunk) {
		this._push(chunk);
	}

	return;

	if (this._first_seq === null) {

		// Get the rtpInfo, should have been sent as a header
		// in a RECORD method
		rtp_info = this._session.rtp_info;

		if (rtp_info) {
			this._first_seq = rtp_info.seq;
			debug('start-sequence detected:', this._first_seq);
		} else {
			this._first_seq = seq - 1;
			debug('no start-sequence detected - defauling to', this._first_seq);
		}
	} else {
		if (this._last_seq >= seq) {
			debug('received chunk', seq, 'multiple times - ignoring');
			return;
		}

		if (this._last_seq + 1 !== seq) {
			//debug('received chunk %s out of order - queueing', seq);
			this._have_unordered = true

			if (chunk) {
				this._unorderd.push([seq, chunk]);
				this._queued_seq.push(seq);
			}

			if (!~this._queued_seq.indexOf(seq - 1)) {
				this.emit('missing', seq - 1);
			}

			return;
		}
	}

	// Chunk can be null,
	// this means we're dropping the sequence
	if (chunk) {
		this._push(chunk);
	}

	this._last_seq = seq;

	if (this._have_unordered) {
		debug('FLUSHING QUEUE', this._unorderd.length);

		this._unorderd = this._unorderd
			.sort(function (a, b) {
				return a[0] - b[0]
			})
			.filter(function (arr) {
				if (that._last_seq + 1 !== arr[0]) return false;
				debug('pushing queued packet (seq:', arr[0], ')');
				that._push(arr[1]);
				that._last_seq = arr[0];
				return true;
			});

		debug('Unordered is now', this._unorderd.length);

		this._have_unordered = this._unorderd.length > 0
	}
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
			debug('back pressure detected!')
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
return
	console.log('Got _READ request');

	if (!this._flowing) {
		debug('entering flowing mode...')
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