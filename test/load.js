// Loads the browser modules into Node for tests.
['catalog', 'parser', 'naming', 'decoder', 'audit', 'sitescan', 'snapshots', 'scan', 'ga4public'].forEach((m) => require(`../js/core/${m}.js`));
module.exports = globalThis.TSD;
