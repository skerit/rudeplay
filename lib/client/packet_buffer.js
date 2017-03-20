var Rudeplay = null,
    counter  = 0,
    Stream   = require('stream'),
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

const WAITING  = 0,
      FILLING  = 1,
      NORMAL   = 2,
      DRAINING = 3,
      ENDING   = 4,
      ENDED    = 5;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The PacketBuffer class
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Develry.Rudeplay.Client.BufferStream}   pool
 */
var PacketBuffer = Fn.inherits(Stream, 'Develry.Rudeplay.Client', function PacketBuffer(session) {

	var that = this;

	// Call the super constructor
	PacketBuffer.super.call(this);

	if (!session) {
		session = {};
	}

	// Store the session
	this.session = session;

	// And the client
	this.client = session.client;

	// All the actual data goes here
	this.buffers = [];

	// Amount of data currently in the buffer
	this.current_size = 0;

	// Amount of chunks seen in total
	this.seen_chunks = 0;

	// The pool of packets
	this.pool = new Rudeplay.Client.PacketPool(this);

	if (this.client) {
		this.max_size = this.client.packets_in_buffer * this.packet_size;
	} else {
		this.max_size = 100 * this.packet_size;
	}

	this.writable = true;
	this.muted = false;

	this.status = WAITING;

	if (Blast.DEBUG) {
		Rudeplay.log('Created PacketBuffer, packet_size:', this.packet_size, ', max_size:', this.max_size);
	}
});

/**
 * Packet size as stored in the client
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
PacketBuffer.setProperty(function packet_size() {

	if (this.client) {
		return this.client.packet_size;
	}
//return 65536/2;
	return 352 * 2 * 2;
});

/**
 * Add a PCM chunk to the buffer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Buffer}   chunk   PCM data
 */
PacketBuffer.setMethod(function write(chunk) {

	this.buffers.push(chunk);
	this.current_size += chunk.length;

	this.seen_chunks++;

	if (this.status === ENDING || this.status === ENDED) {
		throw new Error('Cannot write in buffer after closing it');
	}

	if (this.status === WAITING) {
		// Notify when we receive the first chunk
		this.emit('status', 'buffering');
		this.status = FILLING;
	}

	if (this.status === FILLING && this.current_size >= this.packet_size) {
		this.status = NORMAL;
		this.emit('status', 'playing');
	}

	if (this.current_size > this.max_size) {
		this.status = DRAINING;
		return false;
	}

	return true;
});

/**
 * Get a packet
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
PacketBuffer.setMethod(function readPacket() {

	var remaining,
	    packet,
	    offset,
	    first;

	if (this.seen_chunks === 0) {
		return null;
	}

	// Get a packet
	packet = this.pool.getPacket();

	// Play silence until the buffer is filled enough
	if (this.status !== ENDING && this.status !== ENDED &&
		(this.status === FILLING || this.current_size < this.packet_size)) {
		packet.pcm.fill(0);

		if (this.status !== FILLING && this.status !== WAITING) {
			this.status = FILLING;
			this.emit('status', 'buffering');
		}
	} else {
		remaining = this.packet_size;
		offset = 0;

		// Add data to the packet as long as it isn't full
		while (remaining > 0) {
			// Add silence to the packet if buffer is empty
			if (this.buffers.length === 0) {
				packet.pcm.fill(0, offset);

				// We've added silence til the end
				remaining = 0;
				break;
			}

			first = this.buffers[0];

			// See if this entire packet can be used inside this packet
			if (first.length <= remaining) {
				first.copy(packet.pcm, offset);
				offset += first.length;
				remaining -= first.length;

				// Remove the buffer, since we've used all of it
				this.buffers.shift();
			} else {
				// This buffer contains too much data to fit in the packet, so slice it
				first.copy(packet.pcm, offset, 0, remaining);

				// Make sure the used data is removed
				this.buffers[0] = first.slice(remaining);

				// Packet is full
				remaining = 0;
				offset += remaining;
			}
		}

		// Decrease amount of data currently in buffer
		this.current_size -= this.packet_size;

		// Emit 'end' only once
		if (this.status === ENDING && this.current_size <= 0) {
			this.status = ENDED;
			this.current_size = 0;
			this.emit('status', 'end');
		}

		// Notify that the buffer now has enough room if needed
		if (this.status === DRAINING && this.current_size < this.max_size/2) {
			this.status = NORMAL;
			this.emit('drain');
		}
	}

	if (this.muted) {
		packet.pcm.fill(0);
	}

	packet.seq = this.session.packet_ref + (this.session.ingoing_sequence++);
	packet.retain();

	return packet;
});

/**
 * Get ingoing packet by seq number
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Number}   seq
 *
 * @return   {Object}
 */
PacketBuffer.setMethod(function getIngoingPacket(seq) {
	return this.pool.getIngoingPacket(seq);
});

/**
 * End the stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
PacketBuffer.setMethod(function end() {

	// Flush the buffer if it was filling
	if (this.status === FILLING) {
		this.emit('status', 'playing');
	}

	this.status = ENDING;
});

/**
 * Reset the stream so it can be used again
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
PacketBuffer.setMethod(function reset() {
	this.buffers.length = 0;
	this.current_size = 0;
	this.status = WAITING;
});