var id_count = 0,
    sessions = {},
    Rudeplay = null,
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

Rudeplay = Fn.getNamespace('Develry.Rudeplay');

/**
 * The Session class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.2.0
 *
 * @param    {Incoming}   req   The incoming request
 */
var Session = Fn.inherits('Informer', 'Develry.Rudeplay.Common', function Session(req) {

	var that = this;

	// Store the original request
	this.original_req = req;

	// Store the connection that created the session
	this.connection = req.connection;

	// Create a session id
	this.id = String(~~(Date.now() / 1000)) + String(id_count++);

	// Stored values
	this.values = {};

	// Store this session
	sessions[this.session_id] = this;

	// Is this an ipv6 connection?
	this.is_ipv6 = false;

	if (Blast.DEBUG) {
		Rudeplay.log('Created session', this.id);
	}
});

/**
 * See if this request has a session somewhere
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Incoming}   req
 */
Session.setStatic(function getSession(req) {

	var session,
	    result,
	    key;

	if (req.headers['session'] && sessions[req.headers['session']]) {
		result = sessions[req.headers['session']];

		// @TODO: if session header is defined, but not found,
		// an error response should be returned
	} else {

		for (key in sessions) {
			session = sessions[key];

			if (req.headers['dacp-id']) {
				if (session.original_req.headers['dacp-id'] == req.headers['dacp-id']) {
					result = session;
					break;
				}
			}

			if (req.headers['active-remote']) {
				if (session.original_req.headers['active-remote'] == req.headers['active-remote']) {
					result = session;
					break;
				}
			}

			if (req.headers['client-instance']) {
				if (session.original_req.headers['client-instance'] == req.headers['client-instance']) {
					result = session;
					break;
				}
			}
		}
	}

	return result;
});

/**
 * Get the framelength
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type     {Number}
 */
Session.setProperty(function framelength() {

	if (this.values.sdp_conf && this.values.sdp_conf.alac) {
		return this.values.sdp_conf.alac.frameLength || 352;
	}

	return 352;
});

/**
 * Get the socket type
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type     {String}
 */
Session.setProperty(function socket_type() {
	if (this.is_ipv6) {
		return 'udp6';
	} else {
		return 'udp4';
	}
});

/**
 * Set a value in the session
 *
 * @author   Thomas Watson Steen  <w@tson.dk> 
 * @author   Jelle De Loecker     <jelle@develry.be>
 * @since    0.1.0
 * @version  0.2.0
 */
Session.setMethod(function set(name, value) {

	if (name == 'decoder') {
		this.alac_decoder = value;

		// Forward the decoder output
		this.alac_decoder.pipe(this.alac_output);
	} else if (name == 'volume') {
		if (value < -30) {
			value = 0;
		} else if (this._volume_transform) {
			// RTSP volumes range from -30 to 0, or -144 for muted
			this._volume_transform.setVolume(Math.abs((Math.abs(value)-30)/30));
		}
	}

	if (Blast.DEBUG) {
		Rudeplay.log('Setting session value', name, 'to', value);
	}

	this.values[name] = value;
});

/**
 * Set a value from the session
 *
 * @author   Thomas Watson Steen   <w@tson.dk> 
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Session.setMethod(function get(name) {
	return this.values[name];
});

/**
 * Destroy this session
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.3
 */
Session.setMethod(function destroy() {

	if (Blast.DEBUG) {
		Rudeplay.log('Destroying session', this.id);
	}

	// Delete the session entry
	delete sessions[this.id];

	// Destroy the udp servers
	if (this.rtp_server) {
		this.rtp_server.destroy();
	}

	if (this.rtp_control_server) {
		this.rtp_control_server.destroy();
	}

	if (this.timing_server) {
		this.timing_server.destroy();
	}

	// Close the speaker
	if (this.speaker) {
		this.speaker.close();
	}
});