/*	siteBuild.js 0.2
 *	全站构建工具, 使用前请确保已经安装 uglify-js 和 less 编译器
 *	用法: siteBuild [网站目录] [-f]
 *		网站目录需要包含 framework/sea-config.js 或 framework/require-config.js
 *		siteBuild 会自动从中读取 srcRoot, productRoot, siteVersion 等配置
 *		每次构建成功后(即使没有更新任何模块), 都会自动将配置文件中的 debug 标记设置为 false
 *		siteVersion 中的 release number 会在有模块更新, 并且构建成功后自动 +1
 *
 *		如果当前目录即为网站目录, 则可以忽略网站目录参数
 *
 *		如果带有 -f 参数, 则会强制重新构建所有模块, 但仍会根据 hash 值是否发生变化来决定是否更新版本号
 */

'use strict';
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
	var cfgName = {
		'amd': 'framework/require-config.js',
		'cmd': 'framework/sea-config.js'
	};
	var scfg, sscfg, cfgType;
	var modsdir, upModCount = 0;
	var jsonfile = 'package.json';
	var vers = {};
	for (cfgType in cfgName) {
		scfg = path.join(dir, cfgName[cfgType]);
		if (fs.existsSync(scfg)) {
			sscfg = fs.readFileSync(scfg, {
				encoding: 'utf8'
				//读取配置文件中的变量, 支持常规的压缩
			}).replace(/\r/g, '').match(/^([^=]+=\s*)(\{[^\}]*\})([^=]+=\s*)("[^"]*"|'[^']*')([^=]+=\s*)("[^"]*"|'[^']*')([^=]+=\s*)("[\d\.]*"|'[\d\.]*')([^=]+=\s*)(0|1|!0|!1|true|false)((?:.|\n)+)$/);
			if (sscfg) {
				sscfg.shift();
				delete sscfg.input;
				delete sscfg.index;
				modsdir = path.join(dir, eval(sscfg[3]));
				if (fs.existsSync(modsdir)) {
					var fms = fs.readdirSync(modsdir);
					var i = 0,
						j = 0;
					var tfms, mods, tmod, fnn, files, jsonpath, json, hash, ln, tmpdist, distfile, orgfile;
					loop1();
				} else {
					console.log('srcRoot not found');
				}
			} else {
				console.log('bad config format');
			}
			break;
		}
	}

	function loop1() {
		if (j === 0) {
			tfms = path.join(modsdir, fms[i]);
			if (fs.statSync(tfms).isDirectory()) {
				mods = fs.readdirSync(tfms);
				loop2();
			} else {
				p2();
			}
		} else {
			loop2();
		}
	}

	function loop2() {
		tmod = path.join(tfms, mods[j]);
		if (fs.statSync(tmod).isDirectory()) {
			tmpdist = path.join(tmod, 'dist');
			if (fs.existsSync(tmpdist)) {
				rdsync(tmpdist);
			}
			files = getfiles(tmod);
			if (files.length > 0) {
				fnn = fms[i] + '/' + mods[j];
				jsonpath = path.join(tmod, jsonfile);
				if (fs.existsSync(jsonpath) && !fs.statSync(jsonpath).isDirectory()) {
					json = JSON.parse(fs.readFileSync(jsonpath, {
						encoding: 'utf8'
					}));
				} else {
					json = {
						version: '0.0.1'
					};
				}
				hash = dirhash(tmod, files);
				if (hash !== json.hash || force) {
					if (hash !== json.hash) {
						upModCount += 1;
						//do not update the version number for the first time build
						if ('hash' in json) {
							json.version = updatever(json.version);
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
		var ast, deps;
		ast = UglifyJS.parse(fs.readFileSync(orgfile, {
			encoding: 'utf8'
		}));
		if (cfgType === 'cmd') {
			deps = [];
			ast.walk(new UglifyJS.TreeWalker(function(node, descend) {
				if (node instanceof UglifyJS.AST_Call && node.expression.name === 'require' && node.args.length) {
					deps.push(node.args[0].clone());
				}
			}));
		}
		ast.figure_out_scope();
		ast = ast.transform(new UglifyJS.TreeTransformer(function(node, descend) {
			if (node instanceof UglifyJS.AST_Call && node.expression.name === 'define') {
				if (deps) {
					node.args.unshift(new UglifyJS.AST_Array({
						elements: deps
					}));
				}
				node.args.unshift(new UglifyJS.AST_String({
					value: fnn + '/' + files[ln].replace(/\.js$/, '')
				}));
				return node;
			}
		}));
		ast.figure_out_scope();
		ast = ast.transform(UglifyJS.Compressor({
			sequences: true, // join consecutive statemets with the “comma operator”
			properties: true, // optimize property access: a["foo"] → a.foo
			dead_code: true, // discard unreachable code
			drop_debugger: true, // discard “debugger” statements
			unsafe: true, // some unsafe optimizations (see below)
			conditionals: true, // optimize if-s and conditional expressions
			comparisons: true, // optimize comparisons
			evaluate: true, // evaluate constant expressions
			booleans: true, // optimize boolean expressions
			loops: true, // optimize loops
			unused: true, // drop unused variables/functions
			hoist_funs: true, // hoist function declarations
			hoist_vars: true, // hoist variable declarations
			if_return: true, // optimize if-s followed by return/continue
			join_vars: true, // join var declarations
			cascade: true, // try to cascade `right` into `left` in sequences
			side_effects: true, // drop side-effect-free statements
			warnings: false, // warn about potentially dangerous optimizations/code
		}));
		ast.figure_out_scope();
		ast.compute_char_frequency();
		ast.mangle_names();
		fs.writeFileSync(distfile, ast.print_to_string().replace(rplReg, evalReplace));
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
		var pth = path.join(dir, eval(sscfg[5]), fnn);
		var pth1, pth2;
		if (fs.existsSync(pth)) {
			pth1 = fs.readdirSync(pth);
			for (var k = 0; k < pth1.length; k++) {
				pth2 = path.join(pth, pth1[k]);
				if (fs.lstatSync(pth2).isDirectory()) {
					rdsync(pth2);
				} else {
					fs.unlinkSync(pth2);
				}
			}
		} else {
			mdsync(pth);
		}
		pth = path.join(pth, json.version);
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
		sscfg[9] = 'false';
		fs.writeFileSync(scfg, sscfg.join(''));
		console.log('updated ' + upModCount + ' modules');
	}
}

function getfiles(dir) {
	var f = [];
	var fd = fs.readdirSync(dir);
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

function dirhash(dir, files) {
	var data;
	var hash = crypto.createHash('sha1');
	for (var i = 0; i < files.length; i++) {
		data = fs.readFileSync(path.join(dir, files[i]));
		hash.update(data);
	}
	return hash.digest('base64');
}

function mdsync(p, mode) {
	var pp = path.dirname(path.resolve(p));
	if (!fs.existsSync(pp)) {
		mdsync(pp, mode);
	}
	fs.mkdirSync(p, mode);
}

function rdsync(p) {
	var f = fs.readdirSync(p);
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