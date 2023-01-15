const levelToValue = {
	VERBOSE: 10,
	DEBUG: 20,
	INFO: 30,
	WARN: 40,
	ERROR: 50,
	FATAL: 60,
};

const transports = [];

function shouldLog(
	logMessage,
	minLevel,
	scopeThresholds,
) {
	const threshold = scopeThresholds[logMessage.scope] || minLevel;
	return (levelToValue[logMessage.level] >= levelToValue[threshold]);
}

export function registerLogTransport(
	minLevel,
	logger,
	scopeThresholds = {},
) {
	transports.push((logMessage) => {
		if (shouldLog(logMessage, minLevel, scopeThresholds)) {
			logger(logMessage);
		}
	});
}

function log(message) {
	transports.forEach(logger => logger(message));
}

export default scope => ({
	verbose(...args) {
		log({
			level: 'VERBOSE',
			scope,
			args,
		});
	},
	debug(...args) {
		log({
			level: 'DEBUG',
			scope,
			args,
		});
	},
	info(...args) {
		log({
			level: 'INFO',
			scope,
			args,
		});
	},
	warn(...args) {
		log({
			level: 'WARN',
			scope,
			args,
		});
	},
	error(...args) {
		log({
			level: 'ERROR',
			scope,
			args,
		});
	},
	fatal(...args) {
		log({
			level: 'FATAL',
			scope,
			args,
		});
	},
});
