# Rudeplay

Yet another node.js rtsp/airtunes/airplay server.

## What is this?

This server is meant to receive audio/video coming from Apple devices, or other emulated Airplay clients.

## What is AirPlay?

At first, Apple created **AirTunes**, a server meant to receive and play back audio data.
This was actually just a special kind of **RTSP** server, but only devices with the required key could talk to it.

That key has since been found.

**AirPlay** was the next version of this server, and now supported pictures, videos and screen mirroring.

For now, only audio is working.

## Requirements

You will need to install these system dependencies, on ubuntu/debian you will need to do this:

```bash
sudo apt-get install libavahi-compat-libdnssd-dev
```