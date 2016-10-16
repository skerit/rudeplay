var Rudeplay = null,
    stream   = require('stream'),
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The RtspSequenceStream class
 *
 * @author   René Raab  <mail@reneraab.org>
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {Number}   volume
 */
var Volume = Fn.inherits(stream.Transform, 'Develry.Rudeplay', function VolumeStream(volume) {

	if (volume == null) {
		volume = 1;
	}

	this.setVolume(volume);

	VolumeStream.super.call(this);
});

/**
 * Set the volume from 0 to 1
 *
 * @author   René Raab  <mail@reneraab.org>
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {Number}   volume
 */
Volume.setMethod(function setVolume(volume) {

	this.volume = volume;
	// c.f. https://dsp.stackexchange.com/questions/2990/how-to-change-volume-of-a-pcm-16-bit-signed-audio/2996#2996
	//this.multiplier = Math.pow(10, (-48 + 54*this.volume)/20);

	// c.f. http://www.ypass.net/blog/2010/01/pcm-audio-part-3-basic-audio-effects-volume-control/
	this.multiplier = Math.tan(this.volume);

	if (Blast.DEBUG) {
		Rudeplay.log('Volume multiplier is now', this.multiplier);
	}
});

/**
 * The actual transformation bit
 *
 * @author   René Raab  <mail@reneraab.org>
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 */
Volume.setMethod(function _transform(buf, encoding, callback) {

	// Create a new Buffer for the transformed data
	var out;

	// Do nothing if the volume hasn't changed
	if (this.volume === 1) {
		this.push(buf);
		return callback();
	}

	out = new Buffer(buf.length);

	// Iterate the 16bit chunks
	for (i = 0; i < buf.length; i+=2) {
		// read Int16, multiply with volume multiplier and round down
		var uint = Math.floor(this.volume*buf.readInt16LE(i));

		// higher/lower values exceed 16bit
		uint = Math.min(32767, uint);
		uint = Math.max(-32767, uint);

		// write those 2 bytes into the other buffer
		out.writeInt16LE(uint, i);
	}

	// return the buffer with the changed values
	this.push(out);
	callback();
});

module.exports = Volume;