var Rudeplay = null,
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The PCM Encoder Stream class:
 * Actually just forwards packets
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Object}   options
 */
var PcmEncoder = Fn.inherits('Develry.Rudeplay.Formats.EncoderStream', function PcmEncoderStream(options) {

	// Call parent constructor
	PcmEncoderStream.super.call(this, options);
});