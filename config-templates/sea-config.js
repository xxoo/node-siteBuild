'use strict';
//this config file works for seajs
! function() {
	//make sure modules is defined here
	var modules = {},
		//make sure srcRoot is defined here
		srcRoot = 'dev/',
		//make sure productRoot is defined here
		productRoot = 'dist/',
		//make sure siteVersion is defined here
		siteVersion = "1.0.121",
		//make sure debug is defined here
		debug = false,
		prefix = seajs.data.dir.replace(/^[^:]+:\/\/[^\/]*|[^\/]+\/$/g, ''),
		reg = RegExp('^(?:' + seajs.data.dir + ')?(.+)$');
	seajs.config({
		siteVersion: siteVersion,
		debug: debug,
		toUrl: function(path) {
			var r = path.match(/^([^\/]+\/[^\/]+)(\/.+)?$/),
				s;
			if (r) {
				if (debug || !(r[1] in modules)) {
					s = prefix + srcRoot + path;
				} else {
					s = prefix + productRoot + r[1] + '/' + modules[r[1]];
					r[2] && (s += r[2]);
				}
				return s;
			}
		},
		map: [
			function(uri) {
				var r = uri.match(reg);
				if (r) {
					uri = seajs.data.toUrl(r[1]);
				}
				return uri;
			}
		]
	});
	//call seajs.data.toUrl(module) to get the real path of a module
}();