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
var DecoderStream = Fn.inherits('Develry.Rudeplay.Formats.FormatStream', function DecoderStream(options) {
	DecoderStream.super.call(this, options);
});

/**
 * Indicate this is a decoder
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @type     {Boolean}
 */
DecoderStream.setProperty('is_decoder', true);