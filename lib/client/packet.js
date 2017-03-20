var Rudeplay = null,
    counter  = 0,
    stream   = require('stream'),
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function,
    id       = 0;

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

	// Packet id
	this.id = id++;

	// Store the pool
	this.pool = pool;

	// There are no references
	this.ref = 0;

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

	// Only add to the retained array on the first reference
	if (this.ref == 1) {
		this.pool.retained.push(this);
	}
});

/**
 * Release a packet so it can be used again
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Packet.setMethod(function release() {

	var that = this,
	    index;

	return;

	// Attempt a release after a while
	setInterval(function attemptRelease() {

		that.ref--;

		// If there are no references anymore,
		// it can be reused somewhere
		if (that.ref === 0) {
			that.seq = null;

			// Remove from `retained` array
			index = that.pool.retained.indexOf(that);

			if (index > -1) {
				that.pool.retained.splice(index, 1);
			}

			// Add to the free packets
			that.pool.packets.push(that);
		}
	}, 100);
});