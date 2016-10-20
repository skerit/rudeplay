var MediaConversion = require('mediaconversion'),
    Rudeplay        = null,
    libpath         = require('path'),
    crypto          = require('crypto'),
    stream          = require('stream'),
    Blast           = __Protoblast,
    net             = require('net'),
    fs              = require('fs'),
    Fn              = Blast.Bound.Function;

// Get the Rudeplay namespace
Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Rudeplay Device Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.3
 * @version  0.1.3
 *
 * @param    {Develry.Rudeplay.Client}   client   The client that found this device
 * @param    {Object}                    options  Device options, mdns service info
 */
var Device = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function Device(client, options) {

	// All the found servers
	this.client = client;

	// The device options
	this.options = options || {};

	// The device id
	this.id = options.id || options.name;

	// The device name
	this.name = Blast.Bound.String.after(options.name, '@') || options.name;

	// Hostname
	this.host = options.host;

	// Port it's listening on
	this.port = options.port;

	// The txt record
	this.txt_record = options.txt_record || options.txtRecord;
});

/**
 * Create session
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Device.setMethod(function createSession() {

	var session;

	session = new Rudeplay.Client.Session(this);

	return session;
});