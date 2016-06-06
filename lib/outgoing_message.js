var Rudeplay = null,
    counter  = 0,
    stream   = require('stream'),
    Blast    = __Protoblast,
    util     = require('util'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The outgoing RTSP message class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Incoming}   req
 */
var Outgoing = Fn.inherits(stream.PassThrough, 'Develry.Rudeplay', function OutgoingMessage(req) {

	var that = this;

	stream.PassThrough.call(this);

	// Store the incoming request
	this.req = req;

	// Store the main connection
	this.connection = req.connection;

	// Store the main server instance
	this.rudeplay = req.rudeplay;

	// No headers have been sent yet
	this.headers_sent = false;
	this._headers = {};

	// Set the default status code
	this.status_code = 200;

	// Here will come the done callback
	this.done_callback = null;

	// Since this is already a passthrough stream, we need an informer too
	this.informer = new Blast.Classes.Informer();

	// Forward the date piped into this stream to the connection, once ready
	this.on('data', function onData(chunk) {
		that.informer.afterOnce('ready_to_send', function onceReady() {
			that.connection.socket.write(chunk);
		});
	});

	// Create an entry in the response queue
	this.connection.response_queue.add(function readyToSend(done) {

		// Emit the ready_to_send event
		that.informer.emit('ready_to_send');

		// And store the done callback, too
		that.done_callback = done;
	});
});

/**
 * The session property
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type     {Session}
 */
Outgoing.setProperty(function session() {
	return this.req.session;
}, function setSession(session) {
	this.req._session = session;
});

/**
 * Push Encode
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   chunk
 * @param    {String}   encoding
 * @param    {Function} callback
 */
Outgoing.setMethod(function pushEncode(chunk, encoding, callback) {

	var drained;

	drained = this.push(chunk, encoding);

	if (drained) {
		if (callback) {
			callback();
		}

		return;
	}

	this._drained_callback = callback;
});

/**
 * Send to the client
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   chunk
 * @param    {String}   encoding
 * @param    {Function} cb
 */
Outgoing.setMethod(function send(chunk, encoding, cb) {

});

/**
 * End the response
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   chunk
 * @param    {String}   encoding
 * @param    {Function} cb
 */
Outgoing.setMethod(function end(chunk, encoding, cb) {

	var that = this;

	if (chunk) {
		this.setHeader('content-length', chunk.length);
	}

	// Make sure the headers have been sent
	this.writeHead();

	// Call the actual end method
	// This will circumvent the pushEncode, but will do some closing
	// We can leave this out, and do `pushEncode` instead
	end.super.apply(that, arguments);

	// Make sure we call the done callback, so the queue is freed up
	this.informer.afterOnce('ready_to_send', function done() {
		that.done_callback();
	});
});

/**
 * Set a header
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Outgoing.setMethod(function setHeader(name, value) {

	if (this.headers_sent) {
		throw new Error('Headers already sent!');
	}

	this._headers[name.toLowerCase()] = [name, value];
});

/**
 * Get a header
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Outgoing.setMethod(function getHeader(name) {
	var header = this._headers[name.toLowerCase()];
	return header ? header[1] : undefined;
});

/**
 * Unset a header
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Outgoing.setMethod(function removeHeader(name) {

	if (this.headers_sent) {
		throw new Error('Headers already sent!');
	}

	delete this._headers[name.toLowerCase()];
});

/**
 * Send the headers
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Outgoing.setMethod(function writeHead(status_code, status_message, headers) {

	if (this.headers_sent) {
		return false;
	}

	if (this.req.session && !this.getHeader('session')) {
		this.setHeader('Session', this.req.session.id);
	}

	if (typeof status_message === 'object') {
		headers = status_message;
		status_message = null;
	}

	if (status_code) this.status_code = status_code;

	this.status_message = status_message || this.status_message || this.rudeplay.status_codes[String(this.status_code)];
	var status_line = util.format('RTSP/1.0 %s %s\r\n', this.status_code, this.status_message);

	this._writeHead(status_line, headers);

	return true;
});

/**
 * Send the headers
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Outgoing.setMethod(function _writeHead(start_line, headers) {

	var that = this,
	    header,
	    value,
	    name,
	    key,
	    i;

	if (this.headers_sent) {
		throw new Error('Headers already sent!');
	}

	if (headers) {
		for (key in headers) {
			this.setHeader(name, headers[key]);
		}
	}

	this.pushEncode(start_line, 'utf8');

	for (key in this._headers) {
		header = this._headers[key];
		name = header[0];
		value = header[1];

		if (!Array.isArray(value)) {
			value = [value];
		}

		for (i = 0; i < value.length; i++) {
			// util.format('%s: %s\r\n', name, value)
			this.pushEncode(util.format('%s: %s\r\n', name, value[i]), 'utf8');
		}
	}

	// Send another newline,
	// indicating the end of the header
	this.pushEncode('\r\n', 'utf8');

	// Set headers_sent to true,
	// so we won't send them again
	this.headers_sent = true;
});

module.exports = Outgoing;