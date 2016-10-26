var Rudeplay = null,
    counter  = 0,
    stream   = require('stream'),
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The incoming RTSP message class
 *
 * @author        Jelle De Loecker   <jelle@develry.be>
 * @since         0.1.0
 * @version       0.2.0
 */
var Incoming = Fn.inherits(stream.PassThrough, 'Develry.Rudeplay.Server', function IncomingMessage(connection, header) {

	var lines;

	// Call the parent constructor
	stream.PassThrough.call(this);

	// Store the socket
	this.connection = connection;

	// Store the main server instance
	this.rudeplay = connection.rudeplay;

	// Request number
	this.req_nr = counter++;

	// Headers
	this.headers = {};

	// Subheaders
	this.sub_headers = {};

	// Method is empty at first
	this.method = '';

	// Create the outgoing response (for the server, not client)
	if (this.rudeplay) {
		this.res = new Rudeplay.Server.OutgoingMessage(this);
	}

	// Process the header
	if (header) {
		this._processHeader(header);
	}
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
Incoming.setProperty(function session() {

	if (!this._session) {
		this.createOrGetSession();
	}

	return this._session;
}, function setSession(session) {
	this._session = session;
});

/**
 * Get the session by id, or create a new one
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Incoming.setMethod(function createOrGetSession() {

	var session;

	// Try getting the session
	session = Rudeplay.Server.Session.getSession(this);

	if (session == null) {
		session = new Rudeplay.Server.Session(this);
	}

	// Overwrite the session
	this.session = session;

	return session;
});

/**
 * Get the expected content length
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Incoming.setProperty(function content_length() {

	// If there is no content-length header,
	// there is no body and the length is zero
	if (this.headers['content-length'] == null) {
		return 0;
	}

	return Number(this.headers['content-length']) || 0;
});

/**
 * Get the entire body buffer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}   callback
 */
Incoming.setMethod(function getBody(callback) {

	var buffer;

	// Consume all the data
	this.on('data', function gotData(chunk) {
		if (buffer == null) {
			buffer = chunk;
		} else {
			buffer = Buffer.concat([buffer, chunk]);
		}
	});

	// Wait for the stream to end
	this.on('end', function onEnd() {

		if (!buffer) {
			// Make sure there is a buffer response
			buffer = new Buffer(0);
		}

		callback(null, buffer);
	});
});

/**
 * Process the headers
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   header
 */
Incoming.setMethod(function _processHeader(header) {

	var headers = this.headers,
	    lines,
	    match,
	    line,
	    name,
	    val,
	    i;

	// Split the lines
	lines = String(header).match(/[^\r\n]+/g);

	// Store the raw headers
	this.raw_headers = lines;

	if (!lines) {
		Rudeplay.log('Received unknown header:', header);
		return;
	}

	// Get the first line
	line = lines.shift();

	// See if it's a response
	this.is_response = line.indexOf('RTSP/1.0') === 0;

	if (this.is_response) {

		// This will extract the status info
		match = line.match(/^RTSP\/(\d\.\d) (\d{3}) (.*)[\r\n]*$/);

		if (!match) {
			throw new Error('Invalid RTSP Status-Line: ' + line);
		}

		this.rtsp_version = match[1];
		this.status_code = parseInt(match[2], 10);
		this.status_message = match[3];
	} else {

		// This will extract the request line containing method, path, ...
		match = line.match(/^([A-Z_]+) ([^ ]+) RTSP\/(\d\.\d)[\r\n]*$/);

		if (!match) {
			throw new Error('Invalid RTSP Request-Line: ' + line);
		}

		this.method = match[1];
		this.uri = match[2];
		this.rtsp_version = match[3];
	}

	// Iterate over all the other lines
	for (i = 0; i < lines.length; i++) {
		line = lines[i];

		// Extra lines of a multi-line header start with whitespace
		if (line[0] === ' ' || line[0] === '\t') {
			val += ' ' + line.trim();
			continue;
		}

		// See if there's something to process from the previous iteration
		if (name) {
			this._addHeaderLine(name, val, headers);
		}

		val = line;

		index = line.indexOf(':');
		name = line.substr(0, index);
		val = line.substr(index + 1).trim();
	}

	// Finish up
	if (name) {
		this._addHeaderLine(name, val, headers);
	}
});

/**
 * Split a special header string into parts
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.2.0
 *
 * @param    {String}   line
 *
 * @return   {Object}
 */
Incoming.setMethod(function splitHeaderLine(line) {

	var result = {},
	    pairs,
	    pair,
	    i;

	pairs = line.split(';');

	for (i = 0; i < pairs.length; i++) {
		pair = pairs[i].split('=');

		result[pair[0]] = pair[1] || true;
	}

	return result;
});

/**
 * The following function is lifted from:
 * https://github.com/nodejs/node/blob/f1294f5bfd7f02bce8029818be9c92de59749137/lib/_http_incoming.js#L116-L170
 *
 * Add the given (field, value) pair to the message
 *
 * Per RFC2616, section 4.2 it is acceptable to join multiple instances of the
 * same header with a ', ' if the header in question supports specification of
 * multiple values this way. If not, we declare the first instance the winner
 * and drop the second. Extended header fields (those beginning with 'x-') are
 * always joined.
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @since    0.1.0
 * @version  0.2.0
 */
Incoming.setMethod(function _addHeaderLine(field, value, dest) {

	var obj;

	field = field.toLowerCase();

	switch (field) {
		// Array headers:
		case 'set-cookie':
			if (dest[field] !== undefined) {
				dest[field].push(value);
			} else {
				dest[field] = [value];
			}
			break

		// list is taken from:
		// https://mxr.mozilla.org/mozilla/source/netwerk/protocol/http/src/nsHttpHeaderArray.cpp
		case 'content-type':
		case 'content-length':
		case 'user-agent':
		case 'referer':
		case 'host':
		case 'authorization':
		case 'proxy-authorization':
		case 'if-modified-since':
		case 'if-unmodified-since':
		case 'from':
		case 'location':
		case 'max-forwards':
		case 'retry-after':
		case 'etag':
		case 'last-modified':
		case 'server':
		case 'age':
		case 'expires':
			// drop duplicates
			if (dest[field] === undefined) dest[field] = value;
			break

		default:
			// make comma-separated list
			if (typeof dest[field] === 'string') {
				dest[field] += ', ' + value;
			} else {
				dest[field] = value;
			}
	}

	// If this is a header containing ; and = it contains more data
	if (value.indexOf(';') > -1 && value.indexOf('=') > -1) {
		obj = this.splitHeaderLine(value);

		if (!this.sub_headers[field]) {
			this.sub_headers[field] = obj;
		} else {
			Blast.Bound.Object.assign(this.sub_headers[field], obj);
		}
	}
});

module.exports = Incoming;