var Rudeplay = null,
    dgram    = require('dgram'),
    Blast    = __Protoblast,
    util     = require('util'),
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Timing server class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Incoming}   req   The incoming request
 */
var Timing = Fn.inherits('Informer', 'Develry.Rudeplay', function TimingServer(req) {

	var that = this;

	// Store the main server instance
	this.rudeplay = req.connection.rudeplay;

	// Store the connection
	this.connection = req.connection;

	// Original request
	this.req = req;

	// Store the session
	this.session = req.session;

	// Store this in the session
	this.session.set('timing_server', this);

	// Create a dgram server
	this.server = dgram.createSocket(this.session.socket_type);

	this.server.on('message', function gotRtpMessage(msg, rinfo) {

		if (Blast.DEBUG) {
			console.log('Got Timing message: ' + msg);
		}
	});

	// Original port: 50607
	this.server.bind(function bound() {
		var addr = that.server.address();

		if (Blast.DEBUG) {
			console.log('Timing server listening', addr.port);
		}

		that.emit('ready', addr.port);
		that.emit('done', null, addr.port);
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
Timing.setProperty(function session() {
	return this.req.session;
});

/**
 * Destroy the server
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Timing.setMethod(function destroy() {
	this.server.close();
});

module.exports = Timing;