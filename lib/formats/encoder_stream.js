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