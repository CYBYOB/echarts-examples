# 开发
## 存量变更
1. TS：编辑 /etc/nginx/echarts-examples/public/examples/ts 目录下的ts文件
2. JS：npm run compile:example —— 自动根据TS文件生成JS文件，并放置 /etc/nginx/echarts-examples/public/examples/js 目录下。

## 新增用例
1. TS：新增 /etc/nginx/echarts-examples/public/examples/ts 目录下的ts文件
2. JS：npm run compile:example —— 自动根据TS文件生成JS文件，并放置 /etc/nginx/echarts-examples/public/examples/js 目录下。

# 部署
1. 配置 nginx.conf： server_name chart.91ai.pro; root /etc/nginx/echarts-examples/public;
2. 【！实时生效】变更TS：/etc/nginx/echarts-examples/public/examples/ts 目录下的ts文件
3. 【！实时生效】生成JS：npm run compile:example