const util = require('util');

const logger = {
  info: (...args) => {
    console.log(new Date().toISOString(), '[INFO]', ...args);
  },
  warn: (...args) => {
    console.warn(new Date().toISOString(), '[WARN]', ...args);
  },
  error: (...args) => {
    console.error(new Date().toISOString(), '[ERROR]', ...args);
  },
  debug: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(new Date().toISOString(), '[DEBUG]', ...args);
    }
  }
};

module.exports = logger;