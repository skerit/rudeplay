var fs = require('fs'),
    libpath = require('path'),
    Rudeplay,
    files,
    Blast,
    file,
    i;

// Get an existing Protoblast instance,
// or create a new one
if (typeof __Protoblast != 'undefined') {
	Blast = __Protoblast;
} else {
	Blast = require('protoblast')(false);
}

// Get the Rudeplay namespace
Rudeplay = Blast.Bound.Function.getNamespace('Develry.Rudeplay');

Rudeplay.low32 = function low32(i) {
	return i % 4294967296;
};

Rudeplay.low16 = function low16(i) {
	return i % 65536;
};

// Require the main rudeplay file first
require('./ntp.js');
require('./server/server.js');
require('./client/client.js');

// Get all the files in the common folder
files = fs.readdirSync(libpath.resolve(__dirname, 'common'));

for (i = 0; i < files.length; i++) {
	file = files[i];

	// Require the file
	require(libpath.resolve(__dirname, 'common', file));
}

// Get all the files in the lib folder
files = fs.readdirSync(libpath.resolve(__dirname, 'server'));

for (i = 0; i < files.length; i++) {
	file = files[i];

	// Don't load this file again, obviously
	if (file == 'server.js') {
		continue;
	}

	// Require the file
	require(libpath.resolve(__dirname, 'server', file));
}

// Get all the files in the lib folder
files = fs.readdirSync(libpath.resolve(__dirname, 'client'));

for (i = 0; i < files.length; i++) {
	file = files[i];

	// Don't load this file again, obviously
	if (file == 'client.js') {
		continue;
	}

	// Require the file
	require(libpath.resolve(__dirname, 'client', file));
}

// Get all the files in the formats folder
files = fs.readdirSync(libpath.resolve(__dirname, 'formats'));

for (i = 0; i < files.length; i++) {
	file = files[i];

	// Require the file
	require(libpath.resolve(__dirname, 'formats', file));
}

// Export the Rudeplay namespace
module.exports = Blast.Classes.Develry.Rudeplay;