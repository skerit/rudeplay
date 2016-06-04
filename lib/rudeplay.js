var MediaConversion = require('mediaconversion'),
    status_codes    = require('./status_codes'),
    Rudeplay        = null,
    libalac         = require('libalac'),
    libpath         = require('path'),
    crypto          = require('crypto')
    Blast           = __Protoblast,
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

// Get the Rudeplay namespace
Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Rudeplay Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
var Server = Fn.inherits('Informer', 'Develry.Rudeplay', function Server(settings) {

	var that = this;

	if (!settings) {
		settings = {};
	}

	// Server name
	this.name = settings.name || 'Rudeplay Server';

	// Server version
	this.version = settings.version || '1.0.0';

	// Port to run on
	this.port = settings.port || 5000;

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

			console.log('Got new request');

			res.setHeader('CSeq', req.headers.cseq);
			res.setHeader('Date', new Date().toGMTString());

			that.emit('request', req, res);

			that.processAirplay(req, res);
		});


		return;

		var req,
		    res;

		console.log('Got socket:', socket);

		

		req = new Rudeplay.IncomingMessage(that, socket);
		res = new Rudeplay.OutgoingMessage(that, socket);

		// Wait for the headers to be processed
		req.once('got_headers', function gotHeaders() {

			console.log('GOT HEADERS:', req.headers);

			res.setHeader('CSeq', req.headers.cseq);
			res.setHeader('Date', new Date().toGMTString());

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
 * @type     {NodeRSA}
 */
Server.prepareProperty(function apple_key(callback) {

	var NodeRSA = require('node-rsa'),
	    buffer;

	// Start reading the file
	buffer = fs.readFileSync(libpath.join(__dirname, '../keys/airport_rsa'));

	return new NodeRSA(buffer);
});

/**
 * Solve apple challenge
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Server.setMethod(function solveAppleChallenge(challenge, ip, mac) {

	var that = this,
	    buff,
	    i;

	ip = ip.split('.');

	for (i = 0; i < ip.length; i++) {
		ip[i] = Number(ip[i]);
	}

	challenge = new Buffer(challenge, 'base64');
	ip = new Buffer(ip);
	mac = new Buffer(mac.replace(/:/g, ''), 'hex');

	if (challenge.length > 16) {
		throw new Error('Challenge is longer than 16 bytes');
	}

	buff = new Buffer(32);
	buff.fill(0);

	challenge.copy(buff);
	ip.copy(buff, challenge.length);
	mac.copy(buff, challenge.length + ip.length);

	return this.apple_key.encryptPrivate(buff, 'base64');
});

var tmp = new Buffer(16);

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
		data.copy(tmp, 0, i, i + 16);
		decipher.update(tmp).copy(data, i, 0, 16);
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

	console.log('Got RTSP method', req.method, req);

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

		case '':
			console.log('Got response:', req);
			res.end();
			return;

		default:
			console.log('Method', req.method, 'is not implemented!');
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
		console.log('TODO: apple challenge ' + challenge);
		address = req.connection.socket.localAddress;

		// Solve the apple challenge
		response = this.solveAppleChallenge(challenge, address, that.mac_address);

		console.log('[APPLE CHALLENGE RESPONSE]', response);

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

		console.log('Probe result:', result);
		console.log('SDP result:', sdp);

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

	console.log('SDP:', lines);

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
		console.log('Disallowing aggregate operation');
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
	req.session.transport = this.splitHeaderLine(req.headers['transport']);

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

		var cookie = new Buffer(24),
		    alac,
		    conf;

		// Get the SDP conf from the session
		conf = req.session.get('sdp_conf');

		// Set default alac options
		alac = {
			frameLength: 352,
			compatibleVersion: 0,
			bitDepth: 16,
			pb: 40,
			mb: 10,
			kb: 14,
			channels: 2,
			maxRun: 255,
			maxFrameBytes: 0,
			avgBitRate: 0,
			sampleRate: 44100
		};

		// Now overwrite them
		Blast.Bound.Object.assign(alac, conf.alac);

		cookie.writeUInt32BE(alac.frameLength, 0);
		cookie.writeUInt8(alac.compatibleVersion, 4);
		cookie.writeUInt8(alac.bitDepth, 5);
		cookie.writeUInt8(alac.pb, 6);
		cookie.writeUInt8(alac.mb, 7);
		cookie.writeUInt8(alac.kb, 8);
		cookie.writeUInt8(alac.channels, 9);
		cookie.writeUInt16BE(alac.maxRun, 10);
		cookie.writeUInt32BE(alac.maxFrameBytes, 12);
		cookie.writeUInt32BE(alac.avgBitRate, 16);
		cookie.writeUInt32BE(alac.sampleRate, 20);

		// Set the decoder
		req.session.set('decoder', libalac.decoder({
			cookie          : cookie,
			channels        : alac.channels,
			bitDepth        : alac.bitDepth,
			framesPerPacket : alac.frameLength
		}));

		next();
	}, function done(err, result) {

		var transport,
		    template;

		if (err) {
			// @TODO: end response
			throw err;
		}

		console.log('All servers created:', err, result);

		template = 'RTP/AVP/UDP;unicast;mode=play;server_port=%s;control_port=%s;timing_port=%s';

		var transport = util.format(template, result[0], result[1], result[2]);

		console.log('Transport:', transport);
		res.setHeader('Transport', transport);
		res.setHeader('Audio-Jack-Status', 'connected');
		//res.setHeader('Content-Base', '/test');

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

		console.log('Unknown content type:', req.headers['content-type']);

		// Respond by saying we don't support this media type
		res.status_code = 415;
		res.end();

		return;
	}

	console.log('ANOUNCE request...');

	// Wait for the entire body buffer
	req.getBody(function gotBody(err, buffer) {

		var conf,
		    fmtp,
		    key,
		    iv;

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

		console.log('Got SDP conf:', conf);

		// Store the SDP configuration in the session
		req.session.set('sdp_conf', conf);

		conf.media[0].invalid.forEach(function eachLine(obj) {

			var pair = obj.value.split(':');

			switch (pair[0]) {

				case 'rsaaeskey':
					key = pair[1];
					break;

				case 'aesiv':
					iv = pair[1];
					break;
			}
		});

		conf.aeskey = that.apple_key.decrypt(new Buffer(key, 'base64'));
		conf.aesiv = new Buffer(iv, 'base64');

		res.end();
	});
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

	console.log('SET:', req.headers);

	req.getBody(function gotBody(err, body) {

		var lines;

		if (err) {
			throw err;
		}

		body = body.toString();

		console.log(' -- SET BODY:', body);

		lines = body.split('\r\n');

		lines.forEach(function eachLine(line) {

			var pair = line.split(': '),
			    vol;

			if (pair[0] === 'volume') {
				vol = parseFloat(pair[1]);
				req.session.set('volume', vol);
			} else {
				req.session.set(pair[0], pair[1]);
			}
		});

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
	console.log('@TODO: TEARDOWN requested, end session');
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

module.exports = Server;