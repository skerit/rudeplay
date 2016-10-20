var Rudeplay = null,
    stream   = require('stream'),
    dgram    = require('dgram'),
    Blast    = __Protoblast,
    util     = require('util'),
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Client RTP server class
 * Actual media data will be sent from this server
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Develry.Rudeplay.Client.Device}   device   The device to connect to
 */
var RtpServer = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function RtpServer(device) {

	var that = this;

	// Store the main client instance
	this.client = device.client;

	// Store the device
	this.device = device;

	// Create a dgram server
	this.server = dgram.createSocket(this.client.socket_type);

	// The port will go here
	this.port = null;
});