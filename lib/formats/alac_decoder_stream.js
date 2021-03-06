var Rudeplay = null,
    counter  = 0,
    libalac  = require('libalac'),
    stream   = require('stream'),
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The ALAC Decoder Stream class
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Session}   session
 * @param    {Object}    options
 */
var AlacDecoder = Fn.inherits('Develry.Rudeplay.Formats.DecoderStream', function AlacDecoderStream(options) {

	// Call parent constructor
	AlacDecoderStream.super.call(this, options);

	// Stream is not saturated at beginning
	this._saturated = false;

	// Get the SDP configuration
	this._sdp_conf = this.session.get('sdp_conf');

	// Get the alac configuration
	this._alac_conf = this._sdp_conf.alac;

	// Create the alac cookie
	this._alac_cookie = this.createAlacCookie(this._alac_conf);

	// Create alac decoder
	this._alac_decoder = libalac.decoder({
		cookie          : this._alac_cookie,
		channels        : this._alac_conf.channels,
		bitDepth        : this._alac_conf.bitDepth,
		framesPerPacket : this._alac_conf.frameLength
	});
});

/**
 * Default alac confiruation
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type     {Object}
 */
AlacDecoder.setProperty('alac_default', {
	frameLength       : 352,
	compatibleVersion : 0,
	bitDepth          : 16,
	pb                : 40,
	mb                : 10,
	kb                : 14,
	channels          : 2,
	maxRun            : 255,
	maxFrameBytes     : 0,
	avgBitRate        : 0,
	sampleRate        : 44100
});

/**
 * Create ALAC cookie
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   chunk
 * @param    {String}   encoding
 * @param    {Function} callback
 *
 * @return   {Buffer}
 */
AlacDecoder.setMethod(function _transform(chunk, encoding, callback) {

	var more;

	// Send packet length to the decoder
	// Don't know why, though
	this._alac_decoder.packets(chunk.length);

	// Push the chunk to the decoder
	this._alac_decoder.write(chunk);

	// Read the ALAC decoder output, if there is any,
	// and forward it
	while ((more = this._alac_decoder.read()) !== null) {
		this.push(more);
	}

	callback();
});

/**
 * Create ALAC cookie
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   alac_config
 *
 * @return   {Buffer}
 */
AlacDecoder.setMethod(function createAlacCookie(alac_config) {

	var cookie = new Buffer(24),
	    conf;

	// Apply default options
	conf = Blast.Bound.Object.assign({}, this.alac_default, alac_config);

	cookie.writeUInt32BE(conf.frameLength, 0);
	cookie.writeUInt8(conf.compatibleVersion, 4);
	cookie.writeUInt8(conf.bitDepth, 5);
	cookie.writeUInt8(conf.pb, 6);
	cookie.writeUInt8(conf.mb, 7);
	cookie.writeUInt8(conf.kb, 8);
	cookie.writeUInt8(conf.channels, 9);
	cookie.writeUInt16BE(conf.maxRun, 10);
	cookie.writeUInt32BE(conf.maxFrameBytes, 12);
	cookie.writeUInt32BE(conf.avgBitRate, 16);
	cookie.writeUInt32BE(conf.sampleRate, 20);

	return cookie;
});