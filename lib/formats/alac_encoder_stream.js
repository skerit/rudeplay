var Rudeplay = null,
    libalac  = require('libalac'),
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The ALAC Encoder Stream class
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   options
 */
var AlacEncoder = Fn.inherits('Develry.Rudeplay.Formats.EncoderStream', function AlacEncoderStream(options) {

	// Call parent constructor
	AlacEncoderStream.super.call(this, options);

	// Create alac decoder
	this._encoder = libalac.encoder({
		cookie          : Rudeplay.Formats.AlacDecoderStream.prototype.createAlacCookie(),
		channels        : 2,
		bitDepth        : 16,
		framesPerPacket : this.client.frames_per_packet,
		frameLength     : 352,
		sampleRate      : 44100
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
AlacEncoder.setProperty('alac_default', {
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
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Buffer}   chunk
 * @param    {String}   encoding
 * @param    {Function} callback
 *
 * @return   {Buffer}
 */
AlacEncoder.setMethod(function _transform(chunk, encoding, callback) {

	var more;

	// Push the chunk to the encoder
	this._encoder.write(chunk);

	// Read the ALAC encoder output, if there is any,
	// and forward it
	while ((more = this._encoder.read()) !== null) {
		this.push(more);
	}

	callback();
});