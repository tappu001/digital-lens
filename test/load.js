// Loads the browser modules into Node for tests.
['catalog', 'parser', 'naming', 'decoder', 'audit', 'sitescan', 'snapshots', 'scan', 'gtmexport', 'inventory', 'ga4public'].forEach((m) => require(`../js/core/${m}.js`));
module.exports = globalThis.TSD;
