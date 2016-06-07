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
require(libpath.resolve(__dirname, 'server.js'));

// Get all the files in the lib folder
files = fs.readdirSync(__dirname);

for (i = 0; i < files.length; i++) {
	file = files[i];

	// Don't load this file again, obviously
	if (file == 'init.js') {
		continue;
	}

	if (file == 'server.js') {
		continue;
	}

	// Require the file
	require(libpath.resolve(__dirname, file));
}

// Export the actual Rudeplay Server class
module.exports = Blast.Classes.Develry.Rudeplay.Server;