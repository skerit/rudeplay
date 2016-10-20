var Rudeplay        = null,
    Blast           = __Protoblast,
    Fn              = Blast.Bound.Function;

// Get the Rudeplay namespace
Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Rudeplay NTP Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
var NTP = Fn.inherits('Informer', 'Develry.Rudeplay', function NTP() {
	// 0x83aa7e80 = ntp_epoch
	this.time_ref = Date.now() - 0x83aa7e80*1000;
});

/**
 * Get the timestamp
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
NTP.setMethod(function timestamp() {

	var ntp_msec,
	    time,
	    msec,
	    ts;

	time = Date.now() - this.timeRef;
	sec = ~~(time/1000);

	msec = time - (sec * 1000);
	ntp_msec = ~~(msec * 4294967.296);

	ts = new Buffer(8);
	ts.writeUInt32BE(sec, 0);
	ts.writeUInt32BE(ntp_msec, 4);

	return ts;
});