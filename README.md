# Rudeplay

Yet another node.js rtsp/airtunes/airplay server.

## What is this?

This server is meant to receive audio/video coming from Apple devices, or other emulated Airplay clients. It'll play any received audio data through the `speaker` module.

## What is AirPlay?

At first, Apple created **AirTunes**, a server meant to receive and play back audio data.
This was actually just a special kind of **RTSP** server, but only devices with the required key could talk to it.

That key has since been found.

**AirPlay** was the next version of this server, and now supported pictures, videos and screen mirroring.

For now, only audio is working.

## Requirements

You will need to install these system dependencies, on ubuntu/debian you will need to do this:

```bash
sudo apt-get install libavahi-compat-libdnssd-dev libasound2-dev
```

## Using it

There aren't that many options for now,
but starting a server is very easy:

```javascript
var Rudeplay = require('rudeplay');

var options = {

	// Defaults to 'Rudeplay Server'
	name    : 'My Airplay Server',

	// Defaults to 1.0.0
	version : '1.0.0',

	// Defaults to 5000
	port    : 5000,

	// Defaults to a random mac address
	mac     : '4e:f8:ce:31:3b:21',

	// Maximum time allowed to wait for a retransmit
	// Fastest I've seen was 2ms, slowest +/400
	// Sometimes, it doesn't come at all.
	retransmit_timeout : 100
};

var server = new Rudeplay.Server.Server();
```

## Client

A client is currently being added, though it doesn't support retransmits yet and can only stream to a Rudeplay server:

```javascript
var Rudeplay = require('rudeplay'),
    fs       = require('fs');

var client = new Rudeplay.Client.Client();

client.on('device', function onDevice(device) {

	var session;

	// Check for the wanted device
	if (device.name.indexOf('udeplay') == -1) {
		return;
	}

	// Create a session, make it play the sound local, too
	session = device.createSession({play_local: true});

	// Wait for the session to be ready, takes about 100ms
	session.on('ready', function onReady() {

		// Stream a raw pcm file
		var file = fs.createReadStream('sound.raw');

		session._stream(file);
	});
});
```

## Retransmits

The reason RAOP/Airtunes/Airplay/... is so fast, is because it uses UDP packets to send audio data.
UDP is a connection-less protocol. It just sends the packet, but doesn't know (or care) if it arrives.

That's why the data packets Airplay clients send start with a sequence number.
If something doesn't seem to arrive, an Airplay server creates a "retransmit" request for that packet and waits for it.

This can be why Airplay sometimes "drops out" now and again:
too much data getting lost and/or too much waiting for retransmitted packages.

Retransmits are normally quite fast: the server can create a request, send it out,
and receive a response in 2ms (that's the fastest I've seen so far)

But sometimes it takes a lot longer than that. And sometimes, it just doesn't come at all.

In rudeplay you can set the retransmit timeout, so that it doesn't wait too long for packets and cause more dropouts.
It's set at 100ms by default, you can lower it if you don't mind to miss some data.
You'll hardly notice a single packet going missing, anyway.