var Rudeplay = null,
    counter  = 0,
    stream   = require('stream'),
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Packet Pool class
 *
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Develry.Rudeplay.Client.PacketBuffer}
 */
var PacketPool = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function PacketPool(packet_buffer) {

	// Store the parent packet buffer instance
	this.packet_buffer = packet_buffer;

	// Packets go here
	this.packets = [];
});

/**
 * Refer to the packet_buffer's packet size
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
PacketPool.setProperty(function packet_size() {
	return this.packet_buffer.packet_size;
});

/**
 * Create a new packet, or get one that has been released
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Develry.Rudeplay.Client.Packet}
 */
PacketPool.setMethod(function getPacket() {

	var packet = this.packets.shift();

	if (!packet) {
		packet = new Rudeplay.Client.Packet(this);
	} else {
		packet.retain();
	}

	return packet;
});

/**
 * Release a packet so it can be used again
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {Develry.Rudeplay.Client.Packet}
 */
PacketPool.setMethod(function release(packet) {
	this.pool.push(packet);
});