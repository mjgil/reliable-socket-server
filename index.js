
module.exports = process.env.RSSOCK_COV
  ? require('./lib-cov')
  : require('./lib');