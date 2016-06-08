var NO_BODY_STATUS_CODES = [100, 304],
    Rudeplay             = null,
    stream               = require('stream'),
    Blast                = __Protoblast,
    Fn                   = Blast.Bound.Function,
    CR                   = 0x0d,
    NL                   = 0x0a;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The connection class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Rudeplay}   rudeplay   The rudeplay instance
 * @param    {Socket}     socket     The actual socket connection
 */
var Connection = Fn.inherits('Informer', 'Develry.Rudeplay', function Connection(rudeplay, socket) {

	// Store the main server instance
	this.rudeplay = rudeplay;

	// Store the socket
	this.socket = socket;

	// Keep the connection alive
	socket.setKeepAlive(true, 120000);

	// Don't buffer output data, send immediately
	socket.setNoDelay(true);

	// Is this socket receiving data?
	this.is_receiving = true;

	// Is this socket sending data?
	this.is_sending = false;

	// Keep a queue of all the requests
	this.request_queue = [];

	// Create a response queue,
	// this will limit only 1 outgoing response to send messages
	this.response_queue = Fn.createQueue({enabled: true});

	// Start processing the socket
	this._processSocket();
});

/**
 * Start processing the data coming from the socket
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   header
 */
Connection.setMethod(function _processSocket() {

	var that = this,
	    received_header,
	    content_length,
	    body_index,
	    processed = 0,
	    header,
	    index,
	    data,
	    temp,
	    req;

	if (this._started) {
		return;
	}

	this._started = true;

	// Listen to data coming from the socket
	this.socket.on('data', function onData(chunk) {

		if (!received_header) {

			if (header == null) {
				header = chunk;
			} else {
				header = Buffer.concat([header, chunk]);
			}

			// See if we encountered the start of the BODY yet
			body_index = getIndexOfBody(processed);

			if (body_index == -1) {
				processed = header.length;
				return;
			}

			// Get the first body chunk
			temp = header.slice(body_index);

			// Crop the header buffer
			header = header.slice(0, body_index);

			// Create a new request object
			req = new Rudeplay.IncomingMessage(that, header);

			// If the rest buffer contains data, push it back
			if (temp.length) {
				// Pause before unshifting,
				// Stops the stream from flowing
				that.socket.pause();

				// Put the first body chunk back on the socket stream
				that.socket.unshift(temp);

				// Resume the stream,
				// it'll start flowing ASAP
				that.socket.resume();
			}

			// Clear the header variable
			header = null;

			// Indicate the header has been received, and we should wait for the body
			received_header = true;

			// Reset the processed length
			processed = 0;

			// Get the content_length to wait for
			content_length = req.content_length;

			// If there is no content length,
			// there is no body to wait for
			if (content_length == 0) {
				received_header = false;
				req.end();
			}

			that.emit('request', req, req.res);

			return;
		}

		// A header has been received, and there is a body we need to wait for
		// So forward the data to the request
		if (processed < content_length) {

			// If we get more data than expected, put some back onto the socket
			if (processed + chunk.length > content_length) {
				index = content_length - processed;

				// Get all the bytes after the end index
				temp = chunk.slice(index);

				// Some clients fail to give the correct body length and send
				// a few extra bits. We'll allow this and just add it to the body
				// If the extra bit is too long, however, we'll push it back on the socket
				if (temp.length > 10) {
					Rudeplay.log('Got extra body: "' + temp + '"');
					Rudeplay.log('__ LAST CHUNK: ' + chunk.toString('utf-8'));

					// And trim the chunk, too
					chunk = chunk.slice(0, index);

					Rudeplay.log('Expected length was', content_length);
					Rudeplay.log('Processed length is now', chunk.length + processed);

					// Pause the socket
					that.socket.pause();

					// Now push the extra bit back onto the socket
					that.socket.unshift(temp);

					// And go back to flowing mode ASAP
					that.socket.resume();
				}
			}

			// Push the chunk to the request
			req.push(chunk);

			// Increment the processed counter
			processed += chunk.length;

			// If we processed the required amount, receiving the body has finished
			// Now we need to reset in order to receive headers again
			if (processed >= content_length) {
				processed = 0;
				received_header = false;
				req.end();
			}
		}
	});

	function getIndexOfBody(start) {

		var buf = header,
		    end = header.length,
		    n;

		// Go back a few places, just in case
		start = start - 3;

		// Make sure we start at zero
		if (!start || start < 0) {
			start = 0;
		}

		for (n = start; n < end - 1; n++) {
			if (buf[n] === CR && buf[n + 1] === NL && buf[n + 2] === CR && buf[n + 3] === NL && n <= end - 4) return n + 4
			if (buf[n] === NL && buf[n + 1] === NL) return n + 2
			if (buf[n] === CR && buf[n + 1] === CR) return n + 2 // weird, but the RFC allows it
		}

		return -1
	}
});

module.exports = Connection;