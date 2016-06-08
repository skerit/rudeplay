var Rudeplay = null,
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Queue class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.2
 */
var Queue = Fn.inherits('Informer', 'Develry.Rudeplay', function Queue() {

	// The first number
	this._first = null;

	// The previous forwarded number
	this._prev_forward = null;

	// The previously received number (if in order)
	this._prev_received = null;

	// The previously requested number
	this._prev_request = null;

	// The actual contents
	this._queue = [];

	// Which reset state we're in
	this._reset_key = 0;

	// Requesting function
	this._request_fnc = null;

	// Forwarding function
	this._forward_fnc = null;

	// Maximum allowed time to wait for missing value
	this._missing_timeout = 1000;

	// Maximum number before it wraps around
	this._wrap_maximum = 65535;

	// Key storage
	this._keys = new Map();
});

/**
 * Set the allowed wait time in ms
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Number}  mr
 */
Queue.setMethod(function setMissingTimeout(ms) {
	this._missing_timeout = ms;
});

/**
 * Set the first number
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Number}  nr
 */
Queue.setMethod(function setFirst(nr) {

	// Set the first number
	this._first = nr;

	// If there is no previous forward,
	// set it as 1 less than this number
	if (this._prev_forward == null) {
		this._prev_forward = nr - 1;
	}

	// If there is no previously received number,
	// set that too
	if (this._prev_received == null) {
		this._prev_received = nr - 1;
	}
});

/**
 * Set the requesting function
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}  fnc
 */
Queue.setMethod(function setRequestFunction(fnc) {
	this._request_fnc = fnc;
});

/**
 * Set the forwarding function
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}  fnc
 */
Queue.setMethod(function setForwardFunction(fnc) {
	this._forward_fnc = fnc;
});

/**
 * Reset the queue order
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Queue.setMethod(function reset() {

	// Reset counter values
	this._first = null;
	this._prev_forward = null;
	this._prev_received = null;
	this._prev_request = null;
	this._prev_tallied = null;

	// Empty the queue
	this._queue.length = 0;

	// Clear all the keys
	this._keys.clear();

	// Increment the reset key
	this._reset_key++;
});

/**
 * Push Encode
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.2
 *
 * @param    {Number}  nr
 * @param    {Object}  value
 */
Queue.setMethod(function push(nr, value) {

	var diff,
	    mnr,
	    i;

	// If this is the first push,
	// set this as the first nr
	if (this._first == null) {
		this.setFirst(nr);
	}

	// Handle wrap arounds in a very simple manner
	if (nr < this._prev_received && nr < 300 && this._prev_received > (this._wrap_maximum * 0.95)) {

		if (Blast.DEBUG) {
			Rudeplay.log('Wrapping around:', this._prev_received, 'to', nr);
		}

		this._prev_received = nr - 1;
		this._prev_forward = this._prev_received;
	}

	// Ignore numbers we've already forwarded
	if (nr < this._prev_forward) {
		return;
	}

	// If this number does not follow on the
	// previously received one, queue it
	if (this._prev_received + 1 !== nr) {

		if (this._prev_request == null) {
			this._prev_request = this._prev_received;
		}

		// Calculate the difference, multiple numbers could be missing
		diff = nr - this._prev_received - 1;

		if (Blast.DEBUG) {
			Rudeplay.log('Received nr: ', nr, 'but previous request was', this._prev_received, 'need to request', diff, 'nrs');
		}

		if (diff > 0) {

			var arr = [];

			// Re-request every missing sequence
			for (i = 1; i <= diff; i++) {
				mnr = this._prev_received + i;
				arr.push(mnr);

				// Make sure this hasn't been queued before
				if (this._keys.has(mnr)) {
					continue;
				}

				// Request this missing number
				this.request(mnr);
			}
		} else {
			if (Blast.DEBUG) {
				Rudeplay.log('Tried to request negative nrs:', diff);
			}
		}

		this._addToQueue(nr, value);
	} else {
		this._push(nr, value);
	}

	// Only increment _prev_received if it's actually bigger,
	// because this is used in calculating how many missing sequences we need to get.
	// If this suddenly dropped by 1000, next time we would re-request 1000 items!
	if (nr > this._prev_received) {
		this._prev_received = nr;
	}
});

/**
 * Actually push
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.2
 *
 * @param    {Number}  nr
 * @param    {Object}  value
 */
Queue.setMethod(function _push(nr, value) {

	// Make sure old re-transmit responses don't mess with wrap-arounds
	if (nr > this._prev_forward && (nr - this._prev_forward) < (this._wrap_maximum / 2)) {
		// This nr now becomes the previously forwarded nr
		this._prev_forward = nr;
	}

	// Call the forward function
	this._forward_fnc(nr, value);
});

/**
 * Continue pushing the values
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 */
Queue.setMethod(function _continue() {

	var entry,
	    i;

	// Sort the array first
	this._queue.sort(sortBySequence);

	// Iterate over the queue
	while (this._queue.length) {
		entry = this._queue[0];

		// @TODO: what happens here on wraparounds?
		if (entry.nr == this._prev_forward + 1) {
			// Remove the entry from the array
			this._queue.shift();

			if (Blast.DEBUG) {
				Rudeplay.log('Flushing nr', entry.nr);
			}

			// And force push the contents
			this._push(entry.nr, entry.value);

			// Overwrite the previous requested nr
			if (entry.nr > this._prev_request) {
				this._prev_request = entry.nr;
			}

			// And the received one, too
			if (entry.nr > this._prev_received) {
				this._prev_received = entry.nr;
			}

			// If this value is in the keys map, remove it
			if (this._keys.has(entry.nr)) {
				this._keys.delete(entry.nr);
			}
		} else {
			break;
		}
	}

});

/**
 * Request a number
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @param    {Number}  nr
 */
Queue.setMethod(function request(nr) {

	var that = this,
	    timedout = false,
	    reset_key = this._reset_key,
	    timer;

	// Emit a requesting event
	this.emit('request', nr);

	// Remember we requested this already
	this._keys.set(nr, true);

	// If there is a function set, execute it
	if (this._request_fnc) {

		// Request the value
		this._request_fnc(nr, function gotValue(err, val) {

			// If a reset has been called since, ignore this completely
			if (that._reset_key != reset_key) {
				return;
			}

			// If already timedout, do nothing
			if (timedout) {
				if (Blast.DEBUG) {
					Rudeplay.log('Request response came too late', nr);
				}
				return;
			}

			// Prevent the timeout from running
			clearTimeout(timer);
		});

		// Create the timeout
		timer = setTimeout(function waitForTimeout() {

			// If a reset has been called since, ignore this completely
			if (that._reset_key != reset_key) {
				return;
			}

			timedout = true;

			if (that._prev_forward == (nr - 1)) {
				that._prev_forward = nr;
			}

			// Emit a timeout event for this number
			that.emit('timeout', nr);

			// Continue this queue
			that._continue();

		}, this._missing_timeout);
	}

	// This nr now becomes the previous requested nr
	this._prev_request = nr;
});

/**
 * Add to the queue
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Number}  nr
 * @param    {Object}  value
 */
Queue.setMethod(function _addToQueue(nr, value) {

	// Add it to the queue array
	this._queue.push({
		nr    : nr,
		value : value
	});

	// Indicate we have this nr
	this._keys.set(nr, value);
});

/**
 * Array sorter
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
function sortBySequence(a, b) {
	return a.nr - b.nr;
}

module.exports = Queue;