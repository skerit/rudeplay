var Rudeplay = null,
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The PCM Decoder Stream class:
 * Actually just forwards packets
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   options
 */
var PcmDecoder = Fn.inherits('Develry.Rudeplay.Formats.DecoderStream', function PcmDecoderStream(options) {

	// Call parent constructor
	PcmDecoderStream.super.call(this, options);
});