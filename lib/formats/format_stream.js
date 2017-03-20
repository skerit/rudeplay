var Rudeplay = null,
    Stream   = require('stream'),
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Format Stream class,
 * this is the basis for any encoder and decoder stream
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @extends  {Stream.Transform}
 *
 * @param    {Object}   options
 */
var Format = Fn.inherits(Stream.Transform, 'Develry.Rudeplay.Formats', function FormatStream(options) {

	var stream_options = {};

	if (!options) {
		options = {};
	}

	if (options.objectMode) {
		stream_options.objectMode = true;
	}

	FormatStream.super.call(this, stream_options);

	// Store the options
	this.options = options;

	// And the session, if any
	this.session = options.session;
});

/**
 * Client property
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @type     {Develry.Rudeplay.Client.Client}
 */
Format.setProperty(function client() {

	if (!this.session) {
		return null;
	}

	return this.session.client;
});

/**
 * Look for a specific type of encoder
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {String}   name
 */
Rudeplay.Formats.getEncoder = function getEncoder(name) {

	var class_name = name;

	if (Rudeplay.Formats[class_name]) {
		return Rudeplay.Formats[class_name];
	}

	class_name = name + 'EncoderStream';

	if (Rudeplay.Formats[class_name]) {
		return Rudeplay.Formats[class_name];
	}

	class_name = Blast.Bound.String.classify(name) + 'EncoderStream';

	if (Rudeplay.Formats[class_name]) {
		return Rudeplay.Formats[class_name];
	}

	console.log('Could not find', class_name)

	return null;
};

/**
 * Look for a specific type of decoder
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {String}   name
 */
Rudeplay.Formats.getDecoder = function getDecoder(name) {

	var class_name = name;

	if (Rudeplay.Formats[class_name]) {
		return Rudeplay.Formats[class_name];
	}

	class_name = name + 'DecoderStream';

	if (Rudeplay.Formats[class_name]) {
		return Rudeplay.Formats[class_name];
	}

	class_name = Blast.Bound.String.classify(name) + 'DecoderStream';

	if (Rudeplay.Formats[class_name]) {
		return Rudeplay.Formats[class_name];
	}

	return null;
};