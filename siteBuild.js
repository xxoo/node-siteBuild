#!/usr/bin/env node

/*	siteBuild.js
 *	全站构建工具, 依赖 uglify-js 和 less 编译器
 *	用法: siteBuild [网站目录] [-f]
 *		使用前请确保网站目录包含 framework/require-config.js, 且其中的 debug 标记为 false
 *		siteBuild 会自动从中读取 srcRoot, productRoot, siteVersion 等配置
 *		每次构建成功后 siteVersion 中的 release number 会在有模块更新时自动 +1
 *
 *		如果当前目录即为网站目录, 则可以忽略网站目录参数
 *
 *		如果带有 -f 参数, 则会强制重新构建所有模块, 但仍会根据 hash 值是否发生变化来决定是否更新版本号
 */

'use strict';
var version = '0.3.2';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var UglifyJS = require('uglify-js');
var less = require('less');

//匹配字符串替换的正则表达式，寻找js中的这种代码 'some string'.replace(/some regex/,'with some text')
//并直接将结果替换掉原来的代码, 以提高发布后的代码执行效率.
//TODO: 正则的实现并不安全，需改用AST
var rplReg = /(?:'(?:(?:[^\n\r']|\\')*?[^\\])??(?:\\\\)*'|"(?:(?:[^\n\r"]|\\")*?[^\\])??(?:\\\\)*")\.replace\(\/((?:\\\\)+|(?:[^\\\/]|[^\/][^\n\r]*?[^\\])(?:\\\\)*)\/(img|igm|mgi|mig|gmi|gim|im|ig|mg|mi|gm|gi|i|m|g),(?:'(?:(?:[^\n\r']|\\')*?[^\\])??(?:\\\\)*'|"(?:(?:[^\n\r"]|\\")*?[^\\])??(?:\\\\)*")\)/g;
var dir, force, n = 2;
if (process.argv.length > 2) {
	while ((!dir || !force) && n < process.argv.length) {
		if (process.argv[n].toLowerCase() === '-f') {
			force = true;
		} else {
			dir = process.argv[n];
		}
		n++;
	}
}
if (!dir) {
	dir = process.cwd();
}
run(dir, force);

function run(dir, force) {
	var sscfg, tfms, mods, tmod, fnn, files, jsonpath, sign, json, hash, ln, tmpdist, distfile, orgfile;
	var scfg = path.join(dir, 'framework/require-config.js');
	var modsdir, distdir, upModCount = 0;
	var signfile = 'siteBuild.json';
	var jsonfile = 'package.json';
	var vers = {};
	if (fs.existsSync(scfg)) {
		sscfg = fs.readFileSync(scfg, {
			encoding: 'utf8'
			//读取配置文件中的变量, 支持常规的压缩
		}).replace(/\r/g, '').match(/^([^=]+=\s*)(\{[^\}]*\})([^=]+=\s*)("[^"]*"|'[^']*')([^=]+=\s*)("[^"]*"|'[^']*')([^=]+=\s*)("[\d\.]*"|'[\d\.]*')([^=]+=\s*)(0|1|!0|!1|true|false)((?:.|\n)+)$/);
		if (sscfg) {
			sscfg.shift();
			delete sscfg.input;
			delete sscfg.index;
			if (eval(sscfg[9])) {
				console.log('please set debug value to false in require-config.js');
			} else {
				modsdir = path.join(dir, eval(sscfg[3]));
				distdir = path.join(dir, eval(sscfg[5]));
				signfile = path.join(distdir, signfile);
				if (fs.existsSync(signfile)) {
					sign = JSON.parse(fs.readFileSync(signfile, {
						encoding: 'utf8'
					}));
				} else {
					sign = {};
				}
				if (!('hashMethod' in sign)) {
					sign.hashMethod = 'sha256';
				}
				if (!('ie8' in sign)) {
					sign.ie8 = true;
				}
				if (sign.version && compareVersion(sign.version, version) > 0) {
					console.log('please update siteBuild first');
				} else {
					if (fs.existsSync(modsdir)) {
						var fms = fs.readdirSync(modsdir).sort();
						var i = 0,
							j = 0;
						loop1();
					} else {
						console.log('srcRoot not found');
					}
				}
			}
		} else {
			console.log('bad config format');
		}
	} else {
		console.log('require-config.js not found');
	}

	function loop1() {
		if (j === 0) {
			tfms = path.join(modsdir, fms[i]);
			if (fs.statSync(tfms).isDirectory()) {
				mods = fs.readdirSync(tfms).sort();
				loop2();
			} else {
				p2();
			}
		} else {
			loop2();
		}
	}

	function loop2() {
		var oldjsonpath;
		tmod = path.join(tfms, mods[j]);
		oldjsonpath = path.join(tmod, jsonfile);
		if (fs.statSync(tmod).isDirectory()) {
			tmpdist = path.join(tmod, 'dist');
			if (fs.existsSync(tmpdist)) {
				rdsync(tmpdist);
			}
			files = getfiles(tmod);
			if (files.length > 0) {
				fnn = fms[i] + '/' + mods[j];
				jsonpath = path.join(distdir, fms[i], mods[j], jsonfile);
				if (fs.existsSync(oldjsonpath) && !fs.statSync(oldjsonpath).isDirectory()) {
					try {
						fs.renameSync(oldjsonpath, jsonpath);
					} catch (e) {
						fs.unlinkSync(oldjsonpath);
					}
				}
				if (fs.existsSync(jsonpath) && !fs.statSync(jsonpath).isDirectory()) {
					json = JSON.parse(fs.readFileSync(jsonpath, {
						encoding: 'utf8'
					}));
				} else {
					json = {
						version: 1
					};
				}
				hash = dirhash(tmod, files);
				if (hash !== json.hash || force) {
					if (hash !== json.hash) {
						upModCount += 1;
						//do not update the version number for the first time build
						if ('hash' in json) {
							if (typeof json.version === 'number') {
								json.version++;
							} else {
								json.version = updatever(json.version);
							}
						}
					}
					ln = 0;
					checkFiles();
				} else {
					vers[fnn] = json.version;
					console.log(fnn + ' is not changed since last build');
					p1();
				}
			} else {
				p1();
			}
		} else {
			p1();
		}
	}

	function checkFiles() {
		var f, d;
		if (ln < files.length) {
			f = files[ln].match(/\.(?:(less)|(js))$/);
			distfile = path.join(tmpdist, files[ln]);
			orgfile = path.join(tmod, files[ln]);
			d = path.dirname(distfile);
			if (!fs.existsSync(d)) {
				mdsync(d);
			}
			if (f) {
				if (f[2]) {
					buildJs();
					ln++;
					checkFiles();
				} else {
					buildLess();
				}
			} else {
				fs.writeFileSync(distfile, fs.readFileSync(orgfile));
				ln++;
				checkFiles();
			}
		} else {
			deploy();
		}
	}

	function buildJs() {
		fs.writeFileSync(distfile, UglifyJS.minify(fs.readFileSync(orgfile, {
			encoding: 'utf8'
		}), {
			ie8: sign.ie8
		}).code.replace(rplReg, evalReplace));
	}

	function buildLess() {
		less.render(fs.readFileSync(orgfile, {
			encoding: 'utf8'
		}), {
			paths: [path.dirname(orgfile)],
			compress: true
		}).then(function(output) {
			fs.writeFileSync(distfile.replace(/less$/, 'css'), output.css);
			ln++;
			checkFiles();
		}, function(err) {
			console.log('error occurs while compiling ' + orgfile + '\n' + err);
		});
	}

	function deploy() {
		var pth = path.join(distdir, fnn);
		var pth1, pth2;
		if (fs.existsSync(pth)) {
			pth1 = fs.readdirSync(pth).sort();
			for (var k = 0; k < pth1.length; k++) {
				pth2 = path.join(pth, pth1[k]);
				if (fs.lstatSync(pth2).isDirectory()) {
					rdsync(pth2);
				}
			}
		} else {
			mdsync(pth);
		}
		pth = path.join(pth, '' + json.version);
		if (fs.existsSync(tmpdist)) {
			fs.renameSync(tmpdist, pth);
		}
		vers[fnn] = json.version;
		if (hash !== json.hash) {
			json.hash = hash;
			fs.writeFileSync(jsonpath, JSON.stringify(json));
		}
		console.log('successfuly built ' + fnn);
		p1();
	}

	function p1() {
		j += 1;
		if (j === mods.length) {
			i += 1;
			j = 0;
		}
		if (i < fms.length) {
			setTimeout(loop1, 0);
		} else {
			updateCfg();
		}
	}

	function p2() {
		i += 1;
		if (i < fms.length) {
			setTimeout(loop1, 0);
		} else {
			updateCfg();
		}
	}

	function updateCfg() {
		sscfg[1] = JSON.stringify(vers);
		if (upModCount > 0) {
			sscfg[7] = JSON.stringify(updatever(eval(sscfg[7])));
		}
		fs.writeFileSync(scfg, sscfg.join(''));
		sign.version = version;
		fs.writeFileSync(signfile, JSON.stringify(sign));
		console.log('updated ' + upModCount + ' modules');
	}

	function dirhash(dir, files) {
		var hash = crypto.createHash(sign.hashMethod);
		for (var i = 0; i < files.length; i++) {
			hash.update(files[i].replace(/\\/g, '/') + '\n');
			hash.update(fs.readFileSync(path.join(dir, files[i])));
		}
		return hash.digest('base64');
	}
}

function getfiles(dir) {
	var f = [];
	var fd = fs.readdirSync(dir).sort();
	for (var i = 0; i < fd.length; i++) {
		var nfd = path.join(dir, fd[i]);
		if (fs.statSync(nfd).isDirectory()) {
			var nfda = getfiles(nfd);
			for (var j = 0; j < nfda.length; j++) {
				f.push(path.join(fd[i], nfda[j]));
			}
		} else {
			if (!fd[i].match(/^\.|\.tpl$|^package\.json$/)) {
				f.push(fd[i]);
			}
		}
	}
	return f;
}

function updatever(ver) {
	var vs = ver.match(/(\d+\.\d+.)(\d+)/);
	if (vs) {
		return vs[1] + (parseInt(vs[2]) + 1);
	} else {
		return '0.0.1';
	}
}

function compareVersion(v1, v2) {
	v1 = v1.split('.');
	v2 = v2.split('.');
	if (v1[0] > v2[0]) {
		return 1;
	} else if (v1[0] < v2[0]) {
		return -1;
	} else {
		if (v1[1] > v2[1]) {
			return 1;
		} else if (v1[1] < v2[1]) {
			return -1;
		} else {
			if (v1[2] > v2[2]) {
				return 1;
			} else if (v1[2] < v2[2]) {
				return -1;
			} else {
				return 0;
			}
		}
	}
}

function mdsync(p, mode) {
	var pp = path.dirname(path.resolve(p));
	if (!fs.existsSync(pp)) {
		mdsync(pp, mode);
	}
	fs.mkdirSync(p, mode);
}

function rdsync(p) {
	var f = fs.readdirSync(p).sort();
	for (var i = 0; i < f.length; i++) {
		var pth = path.join(p, f[i]);
		if (fs.lstatSync(pth).isDirectory()) {
			rdsync(pth);
		} else {
			fs.unlinkSync(pth);
		}
	}
	fs.rmdirSync(p);
}

function evalReplace($0) {
	var result = eval($0);
	var s = result.match(/'/g),
		d;
	if (!s) {
		s = '\'';
	} else {
		d = result.match(/"/g);
		if (!d) {
			s = '"';
		} else {
			s = d.length > s.length ? '\'' : '"';
		}
	}
	return s + result.replace(RegExp('[\\n\\r' + s + '\\\\]', 'g'), function(a) {
		if (a === '\n') {
			return '\\n';
		} else if (a === '\r') {
			return '\\r';
		} else if (a === '\\') {
			return '\\\\';
		} else {
			return '\\' + a;
		}
	}) + s;
}