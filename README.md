# Install
`npm -g install siteBuild`

# 全站构建工具
	用法: siteBuild [网站目录] [-f]
		使用前请确保网站目录包含 index.html, 且其中包含以下代码
		<script>
		var VERSION = '1.0.0',
			MODULES = {}
		</script>
		其中 VERSION 为当前版本号, 格式必须为 x.x.x, MODULES 为站点中的模块.
		构建成功后会自动更新 VERSION 和 MODULES 的值.
		另外站点中可构建的模块都放在 dev 目录中, 并且都以 family/name 结构来保存.
		构建成功后会把编译后的代码放至 dist 目录中.
		具体可参考这个项目 https://github.com/xxoo/fusion

		如果带有 -f 参数, 则会强制重新构建所有模块, 但仍会根据 hash 值是否发生变化来决定是否更新版本号