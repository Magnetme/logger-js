function logPrefix(message) {
	return `${new Date().toISOString()} [${message.scope}] ${message.level}:`;
}

export default ((message) => {
	switch (message.level) {
		case 'VERBOSE':
			console.info(logPrefix(message), ...message.args);
			break;
		case 'DEBUG':
			console.info(logPrefix(message), ...message.args);
			break;
		case 'INFO':
			console.info(logPrefix(message), ...message.args);
			break;
		case 'WARN':
			console.warn(logPrefix(message), ...message.args);
			break;
		case 'ERROR':
			console.error(logPrefix(message), ...message.args);
			break;
		case 'FATAL':
			console.error(logPrefix(message), ...message.args);
			break;
		default:
			// noop
			break;
	}
});
