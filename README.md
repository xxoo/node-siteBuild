# Install
`npm -g install siteBuild`

# 全站构建工具
	用法: siteBuild [网站目录] [-f]
		使用前请确保网站目录包含 framework/require-config.js, 且其中的 debug 标记为 false
		siteBuild 会自动从中读取 srcRoot, productRoot, siteVersion 等配置
		每次构建成功后 siteVersion 中的 release number 会在有模块更新时自动 +1

		如果当前目录即为网站目录, 则可以忽略网站目录参数

		如果带有 -f 参数, 则会强制重新构建所有模块, 但仍会根据 hash 值是否发生变化来决定是否更新版本号