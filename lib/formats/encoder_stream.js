var Rudeplay = null,
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Encoder Stream class,
 * this is the basis for any encoder
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @extends  {Develry.Rudeplay.Formats.FormatStream}
 *
 * @param    {Object}   options
 */
var EncoderStream = Fn.inherits('Develry.Rudeplay.Formats.FormatStream', function EncoderStream(options) {

	if (!options) {
		options = {};
	}

	options.objectMode = true;

	EncoderStream.super.call(this, options);
});

/**
 * Indicate this is an encoder
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @type     {Boolean}
 */
EncoderStream.setProperty('is_encoder', true);

/**
 * Transform the chunk
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   packet      Incoming PCM packet
 * @param    {String}   encoding
 * @param    {Function} callback
 */
EncoderStream.setMethod(function _transform(packet, encoding, callback) {
	// Send it to the real transform method
	this.encodeChunk(packet.pcm, encoding, callback);
});

/**
 * Dummy encoder
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   packet      Incoming packet containing PCM chunk
 * @param    {String}   encoding
 * @param    {Function} callback
 */
EncoderStream.setMethod(function encodeChunk(packet, encoding, callback) {
	this.handleEncoded(packet);
	callback(null);
});

/**
 * Handle a transformed chunk: add sequence number and push it out
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Buffer}   chunk
 */
EncoderStream.setMethod(function handleEncoded(chunk) {

	var rtp_timestamp,
	    result,
	    header,
	    seq;

	// Get the packet sequence
	seq = this.session.getPacketSequence();

	// And the timestamp
	rtp_timestamp = this.session.getRtpTimestamp();

	header = this.session.rtp_server.makeRtpHeader(chunk, rtp_timestamp, seq);

	// Create a new buffer, ready to send to the server
	result = new Buffer(chunk.length + this.session.rtp_server.RTP_HEADER_SIZE);

	// Copy the header into the result packet
	header.copy(result);

	// And add the rest
	chunk.copy(result, this.session.rtp_server.RTP_HEADER_SIZE);

	// Now push it out
	this.push({
		rtp_timestamp : rtp_timestamp,
		seq           : seq,
		pcm           : this.session.packet_buffer.getIngoingPacket(seq),
		result        : result
	});

	// Increment the seq & timestamps
	this.session.incrementPacketSequence();
	this.session.incrementRtpTimestamp();
});