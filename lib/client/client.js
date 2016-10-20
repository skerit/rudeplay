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
 * The Rudeplay Client Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.3
 * @version  0.1.3
 */
var Client = Fn.inherits('Informer', 'Develry.Rudeplay.Client', function Client(settings) {

	// Create an ntp time
	this.ntp = new Rudeplay.NTP();

	// All the found devices
	this.devices = [];

	// Set to these defaults for now
	this.socket_type = 'udp4';
	this.frames_per_packet = 352;
	this.sampling_rate = 44100

	// Start scanning
	this._scan();
});

/**
 * Scan for servers
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.3
 * @version  0.1.3
 */
Client.setMethod(function _scan() {

	var that = this,
	    sequence,
	    browser,
	    mdns;

	// If we're already scanning, do nothing
	if (this.scanning) {
		return true;
	}

	// If mdns could not be loaded, return false
	if (!Rudeplay.Server.Server.mdns) {
		return false;
	}

	mdns = Rudeplay.Server.Server.mdns;

	sequence = [mdns.rst.DNSServiceResolve()];

	if ('DNSServiceGetAddrInfo' in mdns.dns_sd) {
		sequence.push(mdns.rst.DNSServiceGetAddrInfo());
	} else {
		// Fallback to ipv4 only
		sequence.push(mdns.rst.getaddrinfo({families:[4]}));
	}

	sequence.push(mdns.rst.makeAddressesUnique());

	// Create the actual browser
	browser = mdns.createBrowser(mdns.tcp('_raop'), {resolverSequence: sequence});

	// Listen to servers coming online
	browser.on('serviceUp', function onService(service) {
		that.addDevice(service);
	});

	// Listen to servers going offline
	browser.on('serviceDown', function onDown(service) {
		that.removeDevice(service);
	});

	// Start scanning
	browser.start();
});

/**
 * Add a device
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.3
 * @version  0.1.3
 *
 * @param    {Object}   options
 */
Client.setMethod(function addDevice(options) {

	var device,
	    temp,
	    i;

	if (!options) {
		throw new Error('No options defined for device');
	}

	// Make sure this device doesn't exist already
	for (i = 0; i < this.devices.length; i++) {
		device = this.devices[i];

		if (device.id == options.id || device.id == options.name) {
			return device;
		}
	}

	// Create the new device instance
	device = new Rudeplay.Client.Device(this, options);

	// Add it to the array
	this.devices.push(device);

	// Emit as a new device
	this.emit('device', device);

	return device;
});

/**
 * Remove a device
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.3
 * @version  0.1.3
 *
 * @param    {Object}   options
 */
Client.setMethod(function removeDevice(options) {

		var device,
	    temp,
	    i;

	if (!options) {
		return false;
	}

	// Make sure this device doesn't exist already
	for (i = 0; i < this.devices.length; i--) {
		device = this.devices[i];

		if (device.id == options.id || device.id == options.name) {
			this.devices.splice(i, 1);

			// Only remove 1, return
			// If we have to delete more, we would have to decrease i first
			return true;
		}
	}

	return false;
});