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
 * The RtspSequenceStream class
 *
 * @author   Thomas Watson Steen  <w@tson.dk>
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
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

	// The next value we should forward
	this._next_forward_seq = null;

	// Create an internal queue,
	// where we store chunks in as long as we can't flow
	this._queue = [];

	// The new, seq ified queue
	this._queuex = [];

	// Create a new sequence queue
	this._sequeue = new Rudeplay.Queue();

	// How long to wait at most for a missing packet
	this._sequeue.setMissingTimeout(options.timeout || 100);

	// Do something with the values
	this._sequeue.setForwardFunction(function doForward(nr, value) {
		that._pushOrdered(nr, value);
		//that._push(value);
	});

	// Set the request function
	this._sequeue.setRequestFunction(function doRequest(nr, callback) {
		// Re-request the sequence
		that.emit('missing', nr, callback);
	});

	// Listen to timeouts, so we can remove the callback waiting for it
	this._sequeue.on('timeout', function onTimeout(nr) {

		if (Blast.DEBUG) {
			Rudeplay.log('Did not receive', nr, 'in time');
		}

		if (session.retransmit_callbacks.has(nr)) {
			session.retransmit_callbacks.delete(nr);
		}
	});
});

/**
 * Set the next sequence number to play
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {Number}   seq
 */
RtspSequence.setMethod(function setNextSequence(seq) {

	if (Blast.DEBUG) {
		Rudeplay.log('Setting next sequence to play:', seq);
	}

	// Set the sequence number
	this._next_forward_seq = seq;

	// Drain the queue if possible
	this._drainQueue();
});

/**
 * Add a sequence chunk
 *
 * @author   Thomas Watson Steen  <w@tson.dk>
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.2
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
 * @version  0.1.1
 *
 * @param    {Buffer}   chunk
 */
RtspSequence.setMethod(function _push(chunk) {
	if (this._flowing) {
		var result = this.push(chunk);

		if (!result) {
			Rudeplay.log('RtspSequence back pressure detected!');
			this._flowing = false
		}

		return result;
	} else {
		this._queue.push(chunk);
	}
});

/**
 * Push a chunk, ordered
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {Buffer}   chunk
 */
RtspSequence.setMethod(function _pushOrdered(seq, chunk) {

	var result;

	// First: add the chunk to the queue
	this._queuex.push({seq: seq, chunk: chunk});

	// If we haven't actually received a next sequence
	// number we need to forward, do nothing
	if (this._next_forward_seq == null) {
		return;
	}

	// If we're in flowing mode, push them out now
	if (this._flowing) {
		this._drainQueue();
	}

	return;


	if (this._flowing) {
		result = this.push(chunk);

		if (!result) {
			Rudeplay.log('RtspSequence back pressure detected!');
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
 * @version  0.1.2
 */
RtspSequence.setMethod(function _read() {

	var chunk,
	    data,
	    i;

	// Switch to flowing mode
	this._flowing = true;

	// Only start forwarding data once we have an
	// initial sequence number the client wants us to play
	if (this._next_forward_seq == null) {
		return;
	}

	this._drainQueue();

	return;

	this._flowing = true

	if (!this._flowing) {
		Rudeplay.log('RtspSequence entering flowing mode...');
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

/**
 * Actually drain the queue
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 */
RtspSequence.setMethod(function _drainQueue() {

	var result,
	    data,
	    over,
	    i;

	if (this._queuex.length == 0) {
		return;
	}

	// This is dirty, and only works when framelength is 352 probably,
	// but if there are less than 146 items in the queue, it's too soon to drain anything
	if (this._queuex.length < 146) {
		return;
	}

	i = 0;

	//console.log('Draining', this._queuex.length, 'greater than', this._next_forward_seq);

	while (this._queuex.length) {
		data = this._queuex.shift();

		// Drop lagging sequences
		if (data.seq < this._next_forward_seq) {

			if (Blast.DEBUG) {
				Rudeplay.log('Dropping sequence', data.seq, '<', this._next_forward_seq);
			}

			continue;
		}

		// Calculate how many sequences this is over
		over = data.seq - this._next_forward_seq;

		// Don't play too much, or the audio will play too soon
		// Framelength might be 352, packets per second is something else.
		// For 352 framelength it's 128 packets per second
		// @TODO: calculate this "128" number
		if (over > 128) {
			this._queuex.unshift(data);
			break;
		}

		if (Blast.DEBUG) {
			Rudeplay.log('Forwarding sequence', data.seq);
		}

		i++;
		result = this.push(data.chunk);

		// Need to stop pushing now
		if (result == false) {
			this._flowing = false;
			return false;
		}
	}
});

module.exports = RtspSequence;