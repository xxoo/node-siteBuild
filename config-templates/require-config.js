'use strict';
! function() {
	//make sure modules is defined here
	var modules = {},
		//make sure srcRoot is defined here
		srcRoot = 'dev/',
		//make sure productRoot is defined here
		productRoot = 'dist/',
		//make sure siteVersion is defined here
		siteVersion = "1.0.123",
		//make sure debug is defined here
		debug = false,
		cfg = {
			baseUrl: '/mweb/' + srcRoot
		};
	if (!debug) {
		for (var n in modules) {
			modules[n] = '/mweb/' + productRoot + n + '/' + modules[n];
		}
		cfg.paths = modules;
	}
	require.config(cfg);
	//用于外部访问的基本信息
	require.data = {
		siteVersion: siteVersion,
		debug: debug
	};
	//call require.toUrl(module) to get the real path of a module
}();