var id_count = 0,
    sessions = {},
    Rudeplay = null,
    stream   = require('stream'),
    Blast    = __Protoblast,
    dgram    = require('dgram'),
    net      = require('net'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

const OPTIONS    = 0,
      ANNOUNCE   = 1,
      SETUP      = 2,
      RECORD     = 3,
      SETVOLUME  = 4,
      PLAYING    = 5,
      TEARDOWN   = 6,
      CLOSED     = 7,
      SETDAAP    = 8,
      SETART     = 9;

/**
 * The Client Session class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Develry.Rudeplay.Client.Device}   device   The device to connect to
 */
var Session = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function Session(device) {

	var that = this;

	// Store the main client instance
	this.client = device.client;

	// Store the device
	this.device = device;

	// The current status of this client
	this.status = OPTIONS;

	// The control server
	this.rtp_control_server = null;

	// The timing server
	this.timing_server = null;

	// The connection
	this.connection = null;

	this.cseq = 0;
	this.announce_id = null;
	this.active_remote = Blast.Bound.Number.random(0, 999999999);
	this.dacp_id = Blast.Classes.Crypto.randomHex(8);
	this.session = null;
	this.timeout = null;
	this.volume = 50;
	this.password = null;
	this.password_tried = false;
	this.require_encryption = false;
	this.track_info = null;
	this.artwork = null;
	this.artwork_content_type = null;
	this.callback = null;
	this.control_port = null;
	this.timing_port  = null;

	// Start the session
	this.init();
});

/**
 * Start the handshake
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function init(callback) {

	var that = this;

	if (!callback) {
		callback = Fn.thrower;
	}

	Fn.parallel(function createRtpControlServer(next) {
		that.rtp_control_server = new Rudeplay.Client.RtpControlServer(that);
		that.rtp_control_server.once('done', next);
	}, function createTimingServer(next) {
		that.timing_server = new Rudeplay.Client.TimingServer(that);
		that.timing_server.once('done', next);
	}, function done(err) {

		var socket;

		if (err) {
			return callback(err);
		}

		if (Blast.DEBUG) {
			Rudeplay.log('Created RtpControlServer on', that.rtp_control_server.port, 'and TimingServer on', that.timing_server.port);
			Rudeplay.log('Connecting to device at', that.device.host + ':' + that.device.port);
		}

		// Create the socket
		socket = net.connect(that.device.port, that.device.host);

		// And create the connection instance
		that.connection = new Rudeplay.Server.Connection(that, socket);

		// Listen for incoming requests
		that.connection.on('request', function onRequest(req, res) {
			console.log('Req, res:', req, res);
		});

		that.requestOptions();

		callback(null);
	});
});

/**
 * Make an outgoing message
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function createOutgoing(method, uri) {

	var out;

	// Create the outgoing message
	out = new Rudeplay.Server.OutgoingMessage(this.connection);

	// Set the method & uri for the header
	out.method = method;
	out.uri = uri;

	// Set the sequence
	out.setHeader('CSeq',            this.cseq++);
	out.setHeader('User-Agent',      'Radioline/1.4.0');
	out.setHeader('DACP-ID',         this.dacp_id);
	out.setHeader('Client-Instance', this.dacp_id);

	// @TODO: if session id is set ... do so
	out.setHeader('Active-Remote',   this.active_remote);

	// @TODO: include authentication and such

	return out;
});

/**
 * Request options
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function requestOptions(callback) {

	var out;

	if (!callback) {
		callback = Fn.thrower;
	}

	out = this.createOutgoing('OPTIONS', '*');
	out.setHeader('Apple-Challenge', 'SdX9kFJVxgKVMFof/Znj4Q');

	out.end();


});