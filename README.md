# Install
`npm -g install siteBuild`

# 全站构建工具
    用法: siteBuild [网站目录] [-f]
    网站目录需要包含 framework/sea-config.js 或 framework/require-config.js
    siteBuild 会自动从中读取 srcRoot, productRoot, siteVersion 等配置
    每次构建成功后(即使没有更新任何模块), 都会自动将配置文件中的 debug 标记设置为 false
    siteVersion 中的 release number 会在有模块更新, 并且构建成功后自动 +1
    如果当前目录即为网站目录, 则可以忽略网站目录参数
    如果带有 -f 参数, 则会强制重新构建所有模块, 但仍会根据 hash 值是否发生变化来决定是否更新版本号