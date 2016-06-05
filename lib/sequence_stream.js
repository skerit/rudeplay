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

	// Create a new queue
	this._queue = new Rudeplay.Queue();

	// Wait at most 1 second for a missing packet
	this._queue.setMissingTimeout(1000);

	// Do something with the values
	this._queue.setForwardFunction(function doForward(nr, value) {
		that._push(value);
	});

	// Set the request function
	this._queue.setRequestFunction(function doRequest(nr, callback) {
		// Re-request the sequence
		that.emit('missing', nr, callback);
	});

	// Listen to timeouts, so we can remove the callback waiting for it
	this._queue.on('timeout', function onTimeout(nr, ms) {

		console.log('Did not receive', nr, 'in', ms, 'ms')

		if (session.retransmit_callbacks.has(nr)) {
			session.retransmit_callbacks.delete(nr);
		}
	});

	return;

	// The first sequence number we received
	this._first_seq = null;

	// Previously sent sequence
	this._prev_seq = null;

	// The queued sequences
	this._queue = [];


	//

	

	// Wether we're receiving sequences out of order
	this._have_unordered = false;

	// List of sequences we've received but not yet played
	this._queued_seq = [];

	

	// Older properties
	this._last_seq = null;
	this._flowing = false;
	this._queue = [];
	this._unorderd = [];
	this._have_unordered = false;
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
	if (this._queue._first == null) {
		// Get the rtpInfo, should have been sent as a header
		// in a RECORD method
		rtp_info = this._session.rtp_info;

		if (rtp_info) {
			this._queue.setFirst(rtp_info.seq);
		}
	}

	this._queue.push(seq, chunk);


	return;

	// Determine what the first sequence number is
	if (this._first_seq == null) {

		// Get the rtpInfo, should have been sent as a header
		// in a RECORD method
		rtp_info = this._session.rtp_info;

		if (rtp_info) {
			this._first_seq = rtp_info.seq;
		} else {
			this._first_seq = seq - 1;
		}
	} else {

		// If this sequence does not follow the previously sent sequence,push
		// push it on the queue
		if (this._prev_seq + 1 !== seq) {
			console.log('Skipped a sequence, received:', seq, 'but expected', this._prev_seq + 1, 'for session', this._session.id);

			// Calculate the difference, multiple seqs could be missing
			diff = seq - this._prev_seq;

			// Re-request every missing sequence
			for (i = 0; i < diff; i++) {
				mseq = seq + i;

				// If this sequence has already been requested, skip it
				if (this._queue.has(mseq)) {
					continue;
				}

				// Re-request the sequence
				this.emit('missing', mseq);

				// Queue this chunk for later
				this._queue.set(mseq, {
					seq       : mseq, 
					chunk     : null,
					requested : Date.now()
				});
			}



		}


		// If the same sequence is being sent multiple times, ignore it
		if (this._prev_seq >= seq) {
			return;
		}

		if (this._prev_seq +1 !== seq) {
			console.log('Skipped a sequence, received:', seq, 'but expected', this._prev_seq + 1, 'for session', this._session.id);
		}
	}

	if (this._prev_seq != null && seq != this._prev_seq + 1) {
		console.log('Skipped a sequence, received:', seq, 'but expected', this._prev_seq + 1, 'for session', this._session.id);

		// Indicate we don't have the sequences in order anymore
		this._have_unordered = true;

		if (chunk) {
			this._unorderd.push([seq, chunk]);
			this._queued_seq.push(seq);
		}

		

		return;
	}

	// This sequence will now be stored as the previous sequence,
	// for the next one we receive
	this._prev_seq = seq;

	// If we have an unordered state, solve it
	if (this._have_unordered) {
		// Order the sequences
		this._unorderd.sort(orderByFirstEntry);

		// Push

	}

	// If there is an actual chunk, push it on
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

/**
 * Sorting function for Array#sort()
 *
 * @author   Thomas Watson Steen  <w@tson.dk>
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
function orderByFirstEntry(a, b) {
	return a[0] - b[0];
}

module.exports = RtspSequence;