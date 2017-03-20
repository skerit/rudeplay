var Rudeplay = null,
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Playloop class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
var Playloop = Fn.inherits('Informer', 'Develry.Rudeplay.Common', function Playloop(callback, interval) {

	// The actual function to call
	this.callback = callback;

	// The wanted interval
	this.interval = interval;

	// The initial start timestamp
	this.start_timestamp = Date.now();

	// The last time it executed
	this.last_timestamp = 0;

	// The next expected timestamp
	this.next_timestamp = 0;

	// The amount of ticks
	this.actual_ticks = 0;

	// Set the threshold under which setTimeout is no longer allowed
	this.minimum_timeout = 4;

	// Set how much earlier a timeout should execute
	// (Should not be greater than minimum_timeout)
	this.earlier_timeout = 2;

	this.start();
});

/**
 * Start the loop
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Playloop.setMethod(function start() {

	var that = this;

	if (this._started) {
		return;
	}

	// Set the start timestamp
	this.start_timestamp = Date.now();

	// The last time it executed
	this.last_timestamp = this.start_timestamp;

	// Set the next timestamp upon starting the loop
	this.next_timestamp = this.last_timestamp + this.interval;

	this._stopped = false;
	this._started = true;

	// The function which will do the actual looping
	function doLoop() {

		var now = Date.now(),
		    next_wait,
		    difference;

		if (that._stopped === true) {
			return;
		}

		if (that.next_timestamp <= now) {

			// Calculate the difference
			difference = now - that.next_timestamp;

			// Calculate the next time to run
			that.next_timestamp = now + that.interval;

			// Execute the function
			that.callback();

			// Set the current time as the last timestamp
			that.last_timestamp = now;

			// Set amount of executions
			that.actual_ticks++;
		}

		next_wait = that.next_timestamp - now;

		if (next_wait < that.minimum_timeout) {
			// If the amount of ms to wait is smaller than the minimum allowed
			// timeout, we switch to setImmediate instead
			setImmediate(doLoop);
		} else {
			setTimeout(doLoop, next_wait - that.earlier_timeout);
		}
	}

	// Set the initial timeout
	setTimeout(doLoop, this.interval);
});

/**
 * Stop the loop
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Playloop.setMethod(function stop() {
	this._started = false;
	this._stopped = true;
});