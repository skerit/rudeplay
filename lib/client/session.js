var id_count = 0,
    sessions = {},
    Rudeplay = null,
    Speaker  = require('speaker'),
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
 * @param    {Object}                           options
 */
var Session = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function Session(device, options) {

	var that = this,
	    ready;

	options = Blast.Bound.Object.assign({}, this.default_options, options);

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

	// Outgoing messages (for responses)
	this._outgoing_messages = [];

	// Outgoing messages sequence counter
	// (Used for requests, not for packets)
	this.cseq = 0;

	// Set codec type
	this.codec = options.codec;

	// Time reference (RTP Timestamp basis) in seconds
	this.rtp_time_ref = this.convertUnixToRtp();

	// Packet number basis
	this.packet_ref = Blast.Bound.Number.random(0, 9999);

	// Target latency
	this.latency = options.latency;

	// Ingoing message sequence counter
	// (Used to match incoming & outgoing packets)
	this.ingoing_sequence = 0;

	// Last sent audio sequence
	this.packet_sequence = 0;

	// Number of frames sent
	this.frames_sent = 0;

	// Random active remote integer
	this.active_remote = Blast.Bound.Number.random(0, 999999999);

	// Random dacp id
	this.dacp_id = Blast.Classes.Crypto.randomHex(8);

	// Device magic?
	this.device_magic = Blast.Bound.Number.random(0, 999999999);

	// Create an encoder
	this.encoder = new (Rudeplay.Formats.getEncoder(this.codec))({session: this});

	// And an rtp server
	this.rtp_server = new Rudeplay.Client.RtpServer(this);

	// And the buffer stream
	this.packet_buffer = new Rudeplay.Client.PacketBuffer(this);

	// When we started playing (in ms)
	this.play_start = null;

	// Play the sound locally, too?
	this.play_local = options.play_local;

	// Speaker, if we want to output the signal on the client too
	this.speaker = new Speaker({
		channels: 2,          // 2 channels 
		bitDepth: 16,         // 16-bit samples 
		sampleRate: 44100,    // 44,100 Hz sample rate 
		samplesPerFrame: 128
	});

	var last_pushed_sequence = this.packet_ref - 1;

	// Pipe the buffer stream into the encoder
	this.packet_loop = new Rudeplay.Common.Playloop(function packetLoop() {

		var next_push_sequence,
		    expected_sequence,
		    packet,
		    count = 0,
		    i;

		if (!ready) return

		packet = that.packet_buffer.readPacket();

		if (packet != null) {
			that.encoder.write(packet);
		}

		if (!that.play_local) {
			return;
		}

		// Get the packet that should be playing now
		expected_sequence = that.getPlayingSequence();

		count = last_pushed_sequence - expected_sequence;

		if (count < 16) {
			i = 0;

			// Expected sequence is higher than the last pushed one,
			// so we'll have to skip some sequences
			if (expected_sequence > last_pushed_sequence) {
				next_push_sequence = expected_sequence;
			} else {
				next_push_sequence = last_pushed_sequence + 1;
			}

			do {
				packet = that.packet_buffer.getIngoingPacket(next_push_sequence);

				if (packet) {
					that.speaker.write(packet.pcm);
					packet.release();

					count++;
					i++;
					last_pushed_sequence = next_push_sequence;
					next_push_sequence++;
				}
			} while (packet && (i < 16 && count < 18));
		}
	}, 7);

	// Pipe encoder output into the server
	this.encoder.on('data', function onData(data) {
		that.rtp_server.send(data);
	});

	// See which parameters we still need
	this.announce_id = null;
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

	// Start the session
	this.init();

	// Wait for the ready event
	this.on('ready', function onReady() {
		ready = true;
		that.play_start = Date.now() + that.latency;
	});
});

/**
 * Default options
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setProperty('default_options', {
	// 45ms is nearly undetectable (in case of A/V sync)
	latency   : 45,
	codec     : 'pcm'
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

			var temp,
			    i;

			if (req.headers.cseq) {
				for (i = 0; i < that._outgoing_messages.length; i++) {
					temp = that._outgoing_messages[i];

					if (req.headers.cseq == temp._headers['cseq'][1]) {
						temp.emit('response', req);
						that._outgoing_messages.splice(i, 1);
						break;
					}
				}
			}
		});

		that.doHandshake();

		callback(null);
	});
});

/**
 * Increment the packet sequence number
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Number}
 */
Session.setMethod(function incrementPacketSequence() {
	this.packet_sequence++;
	return this.getPacketSequence();
});

/**
 * Get the packet sequence
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Number}
 */
Session.setMethod(function getPacketSequence() {
	return this.packet_ref + this.packet_sequence;
});

/**
 * Increment the rtp timestamp
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Number}   frames_sent   Number of frames to increment. Defaults to frames_per_packet
 *
 * @return   {Number}
 */
Session.setMethod(function incrementRtpTimestamp(frames_sent) {

	if (frames_sent == null) {
		frames_sent = this.client.frames_per_packet;
	}

	this.frames_sent += frames_sent;

	return this.getRtpTimestamp();
});

/**
 * Get the RTP timestamp
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Number}
 */
Session.setMethod(function getRtpTimestamp() {
	return this.rtp_time_ref + this.frames_sent;
});

/**
 * Get elapsed playtime in ms
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Number}
 */
Session.setMethod(function getElapsed() {

	var elapsed = Date.now() - this.play_start;

	return elapsed;
});

/**
 * Get current playing sequence
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Number}
 */
Session.setMethod(function getPlayingSequence() {
	return Math.floor(this.getElapsed() * (44100/1000)/(352)) + this.packet_ref;
});

/**
 * Turn a unix timestamp (ms) into an RTP timestamp (s)
 * without the time reference
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Number}   timestamp
 * @param    {Boolean}  add_latency   Defaults to true
 *
 * @return   {Number}
 */
Session.setMethod(function convertUnixToRtp(timestamp, add_latency) {

	var result;

	if (timestamp == null) {
		timestamp = Date.now();
	}

	if (add_latency || add_latency == null) {
		if (typeof add_latency == 'number') {
			timestamp += add_latency;
		} else {
			timestamp += this.latency;
		}
	}

	result = Rudeplay.low32(~~(timestamp / 1000));

	return result;
});

/**
 * Stream to the client
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function _stream(stream) {

	var that = this;

	if (Blast.DEBUG) {
		Rudeplay.log('Going to stream', stream);
	}

	stream.on('data', function onData(chunk) {
		that.packet_buffer.write(chunk);
	});

	stream.on('end', function onEnd() {
		that.packet_buffer.end();
	});
});

/**
 * Make an outgoing message
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function createOutgoing(method, uri, callback) {

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

	// If a callback is defined attach it to the response
	if (callback) {
		out.once('response', function onResponse(res) {
			callback(null, res);
		});
	}

	this._outgoing_messages.push(out);

	return out;
});

/**
 * Make url
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function makeUri() {
	return 'rtsp://' + this.connection.socket.address().address + '/' + this.announce_id;
});

/**
 * Do the handshake
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function doHandshake(callback) {

	var that = this;

	if (!callback) {
		callback = Fn.thrower;
	}

	Fn.series(function doOptions(next) {
		that.getOptions(function gotOptions(err, res) {

			if (err) {
				return next(err);
			}

			next(err);
		});
	}, function doAnnounce(next) {
		that.getAnnounce(function gotAnnounce(err, res) {

			if (err) {
				return next(err);
			}

			next(err);
		});
	}, function doSetup(next) {
		that.getSetup(function gotSetup(err, res) {

			if (err) {
				return next(err);
			}

			if (Blast.DEBUG) {
				Rudeplay.log('Got transport info:', res.sub_headers.transport);
			}

			that.transport_info = res.sub_headers.transport;
			that.server_port = Number(res.sub_headers.transport.server_port);

			next(err);
		});
	}, function setVolume(next) {
		that.setVolume(next);
	}, function setRecord(next) {
		that.getRecord(next);
	}, function done(err) {

		if (Blast.DEBUG) {
			Rudeplay.log('Handshake has finished:', err);
		}

		if (err) {
			return callback(err);
		}

		that.emit('ready');

		callback();
	});
});

/**
 * Make RTP info for headers
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function makeRtpInfo() {

	var rtp_timestamp,
	    seq;

	// Get the next packetsequence we'll send
	seq = this.getPacketSequence();

	// And the timestamp
	rtp_timestamp = this.getRtpTimestamp();

	return 'seq=' + seq + ';rtptime=' + rtp_timestamp;
});

/**
 * Request options
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function getOptions(callback) {

	var out;

	if (!callback) {
		callback = Fn.thrower;
	}

	// Create the outgoing message
	out = this.createOutgoing('OPTIONS', '*', callback);

	// Set the challenge header
	// @TODO: enable encryption first
	//out.setHeader('Apple-Challenge', 'SdX9kFJVxgKVMFof/Znj4Q');

	// End the request
	out.end();

	return out;
});

/**
 * Announce
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function getAnnounce(callback) {

	var body,
	    out;

	if (!callback) {
		callback = Fn.thrower;
	}

	this.announce_id = Blast.Bound.Number.random(0, 99999999);

	// Create the outgoing message
	out = this.createOutgoing('ANNOUNCE', this.makeUri(), callback);

	body =
		'v=0\r\n' +
		'o=iTunes ' + this.announce_id +' 0 IN IP4 ' + this.connection.socket.address().address + '\r\n' +
		's=iTunes\r\n' +
		'c=IN IP4 ' + this.connection.socket.address().address + '\r\n' +
		't=0 0\r\n';

	// This is the ALAC info
	if (false) {
		body +=
			'm=audio 0 RTP/AVP 96\r\n' +
			'a=rtpmap:96 AppleLossless\r\n' +
			'a=fmtp:96 352 0 16 40 10 14 2 255 0 0 44100\r\n';
	} else {
		// But we'll go with PCM for now
		body +=
			'm=audio 49232 RTP/AVP 98\r\n'+
			'a=rtpmap:98 L16/16000/2\r\n';
	}

	out.setHeader('Content-Type', 'application/sdp');

	// End the request
	out.end(body);

	return out;
});

/**
 * Setup
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function getSetup(callback) {

	var transport,
	    out;

	if (!callback) {
		callback = Fn.thrower;
	}

	// Create the outgoing message
	out = this.createOutgoing('SETUP', this.makeUri(), callback);

	transport =
		'RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;' +
		'control_port=' + this.rtp_control_server.port + ';' +
		'timing_port=' + this.timing_server.port;

	out.setHeader('Transport', transport);

	out.end();

	return out;
});

/**
 * Record
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function getRecord(callback) {

	var body,
	    out;

	if (!callback) {
		callback = Fn.thrower;
	}

	// Create the outgoing message
	out = this.createOutgoing('RECORD', this.makeUri(), callback);

	// Set the RTP info
	out.setHeader('RTP-Info', this.makeRtpInfo());
	out.setHeader('Range', 'npt=0-');

	out.end();

	return out;
});

/**
 * Set the volume
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Session.setMethod(function setVolume(callback) {

	var attenuation,
	    body,
	    out;

	if (!callback) {
		callback = Fn.thrower;
	}

	// Create the outgoing message
	out = this.createOutgoing('SET_PARAMETER', this.makeUri(), callback);

	// Content type is a regular text parameter
	out.setHeader('Content-Type', 'text/parameters');

	// Calculate the volume
	if (this.volume == 0) {
		attenuation = -144;
	} else {
		attenuation = (-30.0)*(100 - this.volume)/100.0;
	}

	body = 'volume: ' + attenuation;

	out.end(body);

	return out;
});