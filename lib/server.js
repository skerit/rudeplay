var MediaConversion = require('mediaconversion'),
    decrypt_buffer  = new Buffer(16),
    status_codes    = require('./status_codes'),
    Rudeplay        = null,
    libalac         = require('libalac'),
    libpath         = require('path'),
    crypto          = require('crypto')
    libip           = require('ipaddr.js'),
    Blast           = __Protoblast,
    Forge           = require('node-forge'),
    util            = require('util'),
    mdns            = null,
    Sdp             = require('sdp-transform'),
    net             = require('net'),
    fs              = require('fs'),
    Fn              = Blast.Bound.Function;

try {
	mdns = require('mdns');
} catch (err) {
	console.log('mdns package not found, announcements will not work');
}

if (Blast.DEBUG) {
	console.log('RUDEPLAY: Debug mode has been enabled');
}

// Get the Rudeplay namespace
Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Rudeplay Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 */
var Server = Fn.inherits('Informer', 'Develry.Rudeplay', function Server(settings) {

	var that = this;

	// Apply default settings
	settings = Blast.Bound.Object.assign({}, this.default_settings, settings);

	// Server name
	this.name = settings.name;

	// Server version
	this.version = settings.version;

	// Port to run on
	this.port = settings.port;

	// Retransmission timeout
	this.retransmit_timeout = settings.retransmit_timeout;

	// Generate a MAC address
	this.mac_address = Blast.Bound.String.randomMac(settings.mac);

	// Full broadcast name
	this.broadcast_name = this.mac_address.toUpperCase().replace(/:/g, '') + '@' + this.name;

	// Create a new server
	this._server = net.createServer();

	// Listen for incoming connections
	this._server.on('connection', function gotConnection(socket) {

		var conn = new Rudeplay.Connection(that, socket);

		// Listen for incoming requests
		conn.on('request', function onRequest(req, res) {

			// Always forward the cseq number
			res.setHeader('CSeq', req.headers.cseq);

			// Always add a response data
			res.setHeader('Date', new Date().toGMTString());

			// Emit a request event on rudeplay
			that.emit('request', req, res);

			that.processAirplay(req, res);
		});
	});

	// Start the server
	this._server.listen(this.port);

	// Broadcast
	this.broadcast();
});

/**
 * All the available RTSP status codes
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type {Object}
 */
Server.setProperty('status_codes', status_codes);

/**
 * Default server settings
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.1
 * @version  0.1.1
 *
 * @type {Object}
 */
Server.setProperty('default_settings', {
	name               : 'Rudeplay Server',
	version            : '1.0.0',
	port               : 5000,
	mac                : '',
	retransmit_timeout : 500
});

/**
 * DMAP type information
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type {Object}
 */
Server.setProperty('dmap_types', {
	mper: 8,
	asal: 'str',
	asar: 'str',
	ascp: 'str',
	asgn: 'str',
	minm: 'str',
	astn: 2,
	asdk: 1,
	caps: 1,
	astm: 4,
});

var METHODS = exports.METHODS = ['ANNOUNCE', 'SETUP', 'RECORD', 'PLAY', 'PAUSE', 'FLUSH', 'TEARDOWN', 'OPTIONS', 'GET_PARAMETER', 'SET_PARAMETER', 'POST', 'GET']

/**
 * Broadcast the service
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Server.setMethod(function broadcast() {

	var that = this,
	    instance,
	    config,
	    txt;

	if (!mdns) {
		return false;
	}

	// Txt configuration
	txt = {
		txtvers: '1',     // TXT record version 1
		ch: '2',          // audio channels: stereo
		cn: '0,1,2,3',    // audio codecs
		da: 'true',
		et: '0,3,5',      // supported encryption types
		md: '0,1,2',      // supported metadata types
		pw: 'false',      // does the speaker require a password?
		sv: 'false',
		sr: '44100',      // audio sample rate: 44100 Hz
		ss: '16',         // audio sample size: 16-bit
		tp: 'UDP',        // supported transport: TCP or UDP
		vs: '130.14',     // server version
		am: 'AppleTV2,1', // device model
		sf: '0x4'
	};

	// Found in raop-rtsp-server
	txt = {
		txtvers: '1',
		ch: '2',
		cn: '0,1',
		ek: '1',
		et: '0,1',
		sv: 'false',
		da: 'true',
		sr: '44100',
		ss: '16',
		pw: 'false',
		vn: '65537',
		tp: 'TCP,UDP',
		vs: '105.1',
		am: 'AirPort4,107',
		fv: '76400.10',
		sf: '0x0'
	};

	// nodetunes version
	txt = {
		txtvers: '1',         // txt record version?
		ch: '2',              // # channels
		cn: '0,1',            // codec; 0=pcm, 1=alac, 2=aac, 3=aac elc; fwiw Sonos supports aac; pcm required for iPad+Spotify; OS X works with pcm
		et: '0,1',            // encryption; 0=none, 1=rsa, 3=fairplay, 4=mfisap, 5=fairplay2.5; need rsa for os x
		md: '0',              // metadata; 0=text, 1=artwork, 2=progress
		pw: false,            // password enabled
		sr: '44100',          // sampling rate (e.g. 44.1KHz)
		ss: '16',             // sample size (e.g. 16 bit?)
		tp: 'TCP,UDP',        // transport protocol
		vs: '105.1',          // server version?
		am: 'AirPort4,107',   // device model
		ek: '1',              // ? from ApEx; setting to 1 enables iTunes; seems to use ALAC regardless of 'cn' setting
		sv: 'false',          // ? from ApEx
		da: 'true',           // ? from ApEx
		vn: '65537',          // ? from ApEx; maybe rsa key modulus? happens to be the same value
		fv: '76400.10',       // ? from ApEx; maybe AirPort software version (7.6.4)
		sf: '0x5'             // ? from ApEx
	};

	// mdns configuration
	config = {
		name: this.broadcast_name,
		txtRecord: txt
	};

	// mdns instance
	instance = mdns.createAdvertisement(mdns.tcp('raop'), this.port, config);

	if (Blast.DEBUG) {
		Rudeplay.log('Starting new Rudeplay server: ', JSON.stringify(this.name));
	}

	// And start it
	instance.start();
});

/**
 * The Apple RSA key, syncrhonously created on first get
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type     {Object}
 */
Server.prepareProperty(function apple_key() {

	var priv,
	    key;

	// Get the key file
	key = fs.readFileSync(libpath.join(__dirname, '../keys/airport_rsa'));

	// Get the private key
	priv = Forge.pki.privateKeyFromPem(key);

	return priv;
});

/**
 * Solve apple challenge
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   challenge   The 'Apple-Challenge' header
 * @param    {String}   ip_string   The originating ip address
 * @param    {String}   mac         The originating mac address
 */
Server.setMethod(function solveAppleChallenge(challenge, ip_string, mac) {

	var that = this,
	    full_challenge,
	    response,
	    padding,
	    ip,
	    i;

	ip = libip.parse(ip_string);

	// If it's an ipv6 mapped from ipv4, like :ffff:192.168.1.2,
	// then turn it into ipv4 again
	if (ip.kind() == 'ipv6' && ip.isIPv4MappedAddress()) {
		ip = ip.toIPv4Address();
	}

	// Turn it into a buffer
	ip = new Buffer(ip.toByteArray());

	// Convert the challenge to a buffer, too
	challenge = new Buffer(challenge, 'base64');

	// Replace the ':' separators and turn it into a buffer
	mac = new Buffer(mac.replace(/:/g, ''), 'hex');

	if (challenge.length > 16) {
		throw new Error('Challenge is longer than 16 bytes');
	}

	// Concatenate all the buffers
	full_challenge = Buffer.concat([challenge, ip, mac]);

	// The challenge needs to be at least 32 bytes, but can be longer too!
	padding = [];
	for (i = full_challenge.length; i < 32; i++) {
		padding.push(0);
	}

	if (padding.length) {
		full_challenge = Buffer.concat([full_challenge, new Buffer(padding)]);
	}

	// Encrypt the response
	response = Forge.pki.rsa.encrypt(full_challenge.toString('binary'), this.apple_key, 0x01);

	return Forge.util.encode64(response);
});

/**
 * Encrypt data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Server.setMethod(function decryptData(data, key, iv, header_size) {

	var end_of_encoded_data,
	    remainder,
	    decipher,
	    i;

	if (!key || !iv) {
		throw Error('Cannot decrypt data without valid key & iv!');
	}

	// A normal header is 12 bytes, but in case of retransmitted audio packets
	// received by the RTP control server, the header seems to be 16 bytes (at
	// least when coming from an iOS 9 device). The headerSize argument is used
	// in this case to change the default offset.
	if (!header_size) {
		header_size = 12;
	}

	remainder = (data.length - header_size) % 16;
	end_of_encoded_data = data.length - remainder;

	// TODO: Can this be moved outside of this function?
	decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
	decipher.setAutoPadding(false);

	for (i = header_size, l = end_of_encoded_data - 16; i <= l; i += 16) {
		data.copy(decrypt_buffer, 0, i, i + 16);
		decipher.update(decrypt_buffer).copy(data, i, 0, 16);
	}

	// TODO: This returns a buffer, but will it ever not be empty and do we even need to call it?
	if (decipher.final().length) {
		throw new Error('Unexpected ending of AES decryption');
	}

	return data.slice(header_size);
});

/**
 * Process request as a airplay request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {IncomingMessage}   req
 * @param    {OutgoingMessage}   res
 */
Server.setMethod(function processAirplay(req, res) {

	// Set the server agent
	res.setHeader('Server', 'AirTunes/105.1');

	switch (req.method.toLowerCase()) {

		case 'options':
			return this.optionsAction(req, res);

		case 'describe':
			return this.describeAction(req, res);

		case 'setup':
			return this.setupAction(req, res);

		case 'play':
			return this.playAction(req, res);

		case 'announce':
			return this.announceAction(req, res);

		case 'record':
			return this.recordAction(req, res);

		case 'set_parameter':
			return this.setParameterAction(req, res);

		case 'teardown':
			return this.teardownAction(req, res);

		case 'flush':
			return this.flushAction(req, res);

		case '':
			res.end();
			return;

		default:
			Rudeplay.log('Method', req.method, 'is not implemented!');
			res.status_code = 501;
			res.end();
	}

});

/**
 * Respond to an OPTIONS request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {IncomingMessage}   req
 * @param    {OutgoingMessage}   res
 */
Server.setMethod(function optionsAction(req, res) {

	var that = this,
	    challenge,
	    response,
	    address;

	// Set all the available methods
	res.setHeader('Public', METHODS.join(', '));

	// See if there is a challenge
	challenge = req.headers['apple-challenge'];

	// Handle apple challenge requests
	if (challenge) {

		// Get the client's address
		address = req.connection.socket.localAddress;

		// Solve the apple challenge
		response = this.solveAppleChallenge(challenge, address, that.mac_address);

		// Set the response to the challenge
		res.setHeader('Apple-Response', response);
	}

	res.end();
});

var test_path = '/media/bridge/projects/elric/soundbites/ef_computer_voice/welcome_to_holomatch.mp3';

/**
 * Respond to a DESCRIBE request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {IncomingMessage}   req
 * @param    {OutgoingMessage}   res
 */
Server.setMethod(function describeAction(req, res) {

	var that = this,
	    stream,
	    lines,
	    probe,
	    data;

	res.setHeader('Content-Type', 'application/sdp');

	var sdp = 'v=0';

	sdp += '\r\n' +'o=- 1464957636104887 1 IN IP4 192.168.1.2';
	sdp += '\r\n' +'s=MPEG-1 or 2 Audio, streamed by the LIVE555 Media Server';
	sdp += '\r\n' +'i=welcome_to_holomatch.mp3';
	sdp += '\r\n' +'t=0 0';
	sdp += '\r\n' +'a=tool:LIVE555 Streaming Media v2016.02.09';
	sdp += '\r\n' +'a=type:broadcast';
	sdp += '\r\n' +'a=control:*';
	sdp += '\r\n' +'a=range:npt=0-1.437';
	sdp += '\r\n' +'a=x-qt-text-nam:MPEG-1 or 2 Audio, streamed by the LIVE555 Media Server';
	sdp += '\r\n' +'a=x-qt-text-inf:welcome_to_holomatch.mp3';
	sdp += '\r\n' +'m=audio 0 RTP/AVP 14';
	sdp += '\r\n' +'c=IN IP4 0.0.0.0';
	sdp += '\r\n' +'b=AS:47';
	sdp += '\r\n' +'a=control:track1';
	sdp += '\r\n';

	res.end(sdp);

	return;

	// Create a stream to the file
	stream = fs.createReadStream(test_path);

	probe = MediaConversion.probe(stream);

	probe.on('result', function gotResult(result) {

		var sdp = that.probeToSdp(result, req);

		Rudeplay.log('Probe result:', result);
		Rudeplay.log('SDP result:', sdp);

		res.end(sdp);
	});

	return;

	data = {
		version : 0,
		origin  : {
			username        : '-',
			sessionId       : req.connection.session_id,
			sessionVersion  : 0,
			netType         : 'IN',
			ipVer           : 4,
			address         : '192.168.1.3'
		},
		name    : '',
		timing  : {start : 0, stop: 0},
		media   : [
			{
				rtp : [{
					payload : 96,
					codec   : 'MP3',
					rate    : 48000
				}],
				type     : 'audio',
				protocol : 'RTP/AVP',
				port     : 0
			}
		]
	}

	lines = Sdp.write(data);

	Rudeplay.log('SDP:', lines);

	res.end(lines);

});

/**
 * Respond to a SETUP request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {IncomingMessage}   req
 * @param    {OutgoingMessage}   res
 */
Server.setMethod(function setupAction(req, res) {

	if (req.headers.session) {

		if (Blast.DEBUG) {
			Rudeplay.log('SETUP method: disallowing aggregate operation');
		}

		// Aggregate operation not allowed
		res.status_code = 459;
		res.end();
		return;
	}

	// Make sure a session exist,
	// if no session is set in the headers, a new one is created
	req.createOrGetSession();

	// Set the transport info, it looks like this:
	// RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;control_port=6001;timing_port=6002
	req.session.client_transport = this.splitHeaderLine(req.headers['transport']);

	if (Blast.DEBUG) {
		Rudeplay.log('------------')
		Rudeplay.log('CLIENT TRANSPORT:', req.session.client_transport);
		Rudeplay.log('------------')
	}

	// Start the required servers in parallel
	Fn.parallel(function rtp(next) {

		var server = new Rudeplay.RtpServer(req);
		server.once('done', next);

		req.connection.rtp = server;

	}, function control(next) {

		var server = new Rudeplay.RtpControlServer(req);
		server.once('done', next);

	}, function timing(next) {

		var server = new Rudeplay.TimingServer(req);
		server.once('done', next);

	}, function setAlac(next) {

		req.session.createAlacDecoder();

		return next();
	}, function done(err, result) {

		var transport,
		    template;

		if (err) {
			// @TODO: end response
			throw err;
		}

		// mode=play doesn't seem to work for iphone 6
		template = 'RTP/AVP/UDP;unicast;mode=record;server_port=%s;control_port=%s;timing_port=%s';

		transport = util.format(template, result[0], result[1], result[2]);

		res.setHeader('Transport', transport);
		res.setHeader('Audio-Jack-Status', 'connected');

		res.end();
	});
});

/**
 * Respond to a PLAY request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {IncomingMessage}   req
 * @param    {OutgoingMessage}   res
 */
Server.setMethod(function playAction(req, res) {

	// 'welcome_to_holomatch' length
	res.setHeader('Range', 'npt=0.000-1.437');

	// Send the headers
	res.writeHead();

	fs.createReadStream(test_path).pipe(res);

});

/**
 * Received an ANOUNCE request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {IncomingMessage}   req
 * @param    {OutgoingMessage}   res
 */
Server.setMethod(function announceAction(req, res) {

	var that = this;

	if (req.headers['content-type'] !== 'application/sdp') {

		if (Blast.DEBUG) {
			Rudeplay.log('Unknown content type:', req.headers['content-type']);
		}

		// Respond by saying we don't support this media type
		res.status_code = 415;
		res.end();

		return;
	}

	// Wait for the entire body buffer
	req.getBody(function gotBody(err, buffer) {

		var codec,
		    conf,
		    pair,
		    fmtp,
		    key,
		    obj,
		    iv,
		    i;

		if (err) {
			throw err;
		}

		// Parse the body, which is just an SDP string
		conf = Sdp.parse(buffer.toString());

		// fmtp:96 352 0 16 40 10 14 2 255 0 0 44100
		fmtp = conf.media[0].fmtp[0].config.split(' ');

		// for detailed info about the ALAC cookie, see:
		// https://alac.macosforge.org/trac/browser/trunk/ALACMagicCookieDescription.txt
		conf.alac = {
			frameLength       : parseInt(fmtp[0], 10),   // 32 bit
			compatibleVersion : parseInt(fmtp[1], 10),   // 8 bit
			bitDepth          : parseInt(fmtp[2], 10),   // 8 bit
			pb                : parseInt(fmtp[3], 10),   // 8 bit
			mb                : parseInt(fmtp[4], 10),   // 8 bit
			kb                : parseInt(fmtp[5], 10),   // 8 bit
			channels          : parseInt(fmtp[6], 10),   // 8 bit
			maxRun            : parseInt(fmtp[7], 10),   // 16 bit
			maxFrameBytes     : parseInt(fmtp[8], 10),   // 32 bit
			avgBitRate        : parseInt(fmtp[9], 10),   // 32 bit
			sampleRate        : parseInt(fmtp[10], 10)   // 32 bit
		};

		// Store the SDP configuration in the session
		req.session.set('sdp_conf', conf);

		for (i = 0; i < conf.media[0].invalid.length; i++) {
			obj = conf.media[0].invalid[i];
			pair = obj.value.split(':');

			switch (pair[0]) {

				case 'rsaaeskey':
					key = pair[1];
					break;

				case 'aesiv':
					iv = pair[1];
					break;

				case 'rtpmap':
					codec = pair[1];

					if (codec.indexOf('L16') === -1 && codec.indexOf('AppleLossless') === -1) {
						res.status_code = 415;
						return res.end();
					}

					req.session.set('audio_codec', codec);
					break;

				case 'fmtp':
					break;
			}
		};

		if (conf.connection.version == 6) {
			req.session.is_ipv6 = true;
		}

		conf.aeskey = that.apple_key.decrypt(new Buffer(key, 'base64').toString('binary'), 'RSA-OAEP');
		conf.aesiv = new Buffer(iv, 'base64');

		res.end();
	});
});

/**
 * Received a FLUSH request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {IncomingMessage}   req
 * @param    {OutgoingMessage}   res
 */
Server.setMethod(function flushAction(req, res) {

	// @TODO: fix this value
	res.setHeader('RTP-Info', 'rtptime=1147914212');

	res.end();
});

/**
 * Received an RECORD request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {IncomingMessage}   req
 * @param    {OutgoingMessage}   res
 */
Server.setMethod(function recordAction(req, res) {

	if (req.headers['rtp-info']) {
		req.session.setRtpInfo(req.headers['rtp-info']);
	}

	// @TODO: use actual latency
	res.setHeader('Audio-Latency', 2205);

	res.end();
});

/**
 * Received a SET_PARAMETER request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {IncomingMessage}   req
 * @param    {OutgoingMessage}   res
 */
Server.setMethod(function setParameterAction(req, res) {

	var that = this,
	    content_type,
	    session,
	    data,
	    name,
	    val;

	// Get the content type header
	content_type = req.headers['content-type'];

	// Get the session object
	session = req.session;

	// Wait for the body to arrive
	req.getBody(function gotBody(err, body) {

		if (err) {
			throw err;
		}

		switch (content_type) {

			case 'application/x-dmap-tagged':
				data = that.parseDmap(body);
				session.set('metadata', data);
				session.emit('metadata', data);
				break;

			case 'image/jpeg':
				session.set('artwork', body);
				session.emit('artwork', body);
				break;

			case 'text/parameters':
				data = body.toString().split(': ');
				name = data[0];
				val = data[1];

				if (name == 'volume') {
					val = parseFloat(val);
					session.set('volume', val);
					session.emit('volume', val);
				} else if (name == 'progress') {
					session.set('progress', val);
					session.emit('progress', val);
				} else {
					session.set(name, val);
				}

				break;

			default:
				Rudeplay.log('Unknown SET_PARAMETER method:', body);
		}

		res.end();
	});
});

/**
 * Received a TEARDOWN request
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {IncomingMessage}   req
 * @param    {OutgoingMessage}   res
 */
Server.setMethod(function teardownAction(req, res) {

	// We don't have to destroy the session,
	// the stream just needs to stop playing
	// The session queue also needs to be reset
	req.session.recreateRtspSequence();

	// End the response
	res.end();
});

/**
 * Split a special header string into parts
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   line
 *
 * @return   {Object}
 */
Server.setMethod(function splitHeaderLine(line) {

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
 * Convert an ffprobe result into SDP
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   probe
 *
 * @return   {Object}
 */
Server.setMethod(function probeToSdp(probe, req) {

	var astream,
	    payload,
	    audio,
	    data;

	// Set some sdp defaults
	data = {
		version : 0,
		origin  : {
			username        : '-',
			sessionId       : req.connection.session_id,
			sessionVersion  : 0,
			netType         : 'IN',
			ipVer           : 4,
			address         : '192.168.1.2'
		},
		media   : []
	};

	// Can also be video, this is just for testing now
	astream = probe.streams[0];

	audio = {
		rtp: [],
		type: 'audio',
		protocol: 'RTP/AVP',
		payloads: '',
		port: 0
	};

	switch (astream.codec_name) {

		case 'mp3':
			payload = {
				payload  : 14,
				codec    : 'MPA',
				rate     : astream.sample_rate,
				channels : astream.channels
			};

			audio.rtp.push(payload);
			audio.payloads = '14';

			break;
	}

	data.media.push(audio);

	return Sdp.write(data);
});

/**
 * Parse DMAP data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   buffer
 *
 * @return   {Object}
 */
Server.setMethod(function parseDmap(buffer) {

	var item_length,
	    item_type,
	    output,
	    data,
	    val,
	    i;

	// Prepare output object
	output = {};

	// Iterate over the buffer,
	// we'll increment the counter with the length of the current value
	for (i = 8; i < buffer.length;) {
		item_type = buffer.slice(i, i + 4).toString();
		item_length = buffer.slice(i + 4, i + 8).readUInt32BE(0);

		if (item_length != 0) {
			data = buffer.slice(i + 8, i + 8 + item_length);

			switch (this.dmap_types[item_type]) {

				case 'str':
					val = data.toString();
					break;

				case 1:
					val = data.readUInt8(0);
					break;

				case 2:
					val = data.readUInt16BE(0);
					break;

				case 4:
					val = data.readUInt32BE(0);
					break;

				case 8:
					val = (data.readUInt32BE(0) << 8) + data.readUInt32BE(4);
					break;

				default:
					val = null;
			}

			// Store the found value
			output[item_type] = val;
		}

		// Increment the counter
		i += 8 + item_length;
	}

	return output;
});

/**
 * Debug log
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.1
 * @version  0.1.1
 */
Rudeplay.log = function log() {

	var args = ['[' + Date.now() + ']'].concat(Blast.Bound.Array.cast(arguments));

	return console.log.apply(console, args);
};

module.exports = Server;