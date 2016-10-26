var Rudeplay = null,
    counter  = 0,
    stream   = require('stream'),
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Packet class
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Develry.Rudeplay.Client.PacketPool}   pool
 */
var Packet = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function Packet(pool) {

	// Store the pool
	this.pool = pool;

	// There is 1 reference by default
	this.ref = 1;

	// There is no sequence number assigned yet
	this.seq = null;

	// The actual PCM buffer
	this.pcm = new Buffer(pool.packet_size);
});

/**
 * Retain this packet, indicating it's in use
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Packet.setMethod(function retain() {
	this.ref++;
});

/**
 * Release a packet so it can be used again
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Packet.setMethod(function release(packet) {
	this.ref--;

	// If there are no references anymore,
	// it can be reused somewhere
	if (this.ref === 0) {
		this.seq = null;
		this.pool.release(this);
	}
});