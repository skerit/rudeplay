var fs = require('fs'),
    libpath = require('path'),
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

// Require the main rudeplay file first
require(libpath.resolve(__dirname, 'ntp.js'));
require(libpath.resolve(__dirname, 'server', 'server.js'));
require(libpath.resolve(__dirname, 'client', 'client.js'));

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

// Export the Rudeplay namespace
module.exports = Blast.Classes.Develry.Rudeplay;