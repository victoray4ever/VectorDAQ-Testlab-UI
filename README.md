# VectorDAQ Testlab UI

一个独立运行的暗色系“实验室风”DAQ / NVH 信号分析前端示例：包含项目/通道视图、分析读数面板，以及基于 Three.js 的 RPM-Frequency-Amplitude 3D waterfall 图（支持鼠标拖拽旋转、滚轮缩放、指针移动更新光标与读数）。

这是一个纯前端静态页面项目，附带一个极简 Node HTTP 静态文件服务器用于本地启动，以及一个基于 Playwright 的可视化回归验证脚本（截图 + 像素统计），用于确保 3D 画面与布局在桌面/移动端视口下都能正常渲染。

## 功能概览

- 3D Waterfall：RPM x Frequency x Amplitude（dB g）表面 + 线框 + 峰值点云 + 光标辅助线
- Overlay/读数：光标 slice / order / dB 标签、RPM/FREQ/AMP 与右侧指标联动更新
- Mini spectrum：底部 canvas 绘制当前 slice 的频谱线
- UI 骨架：Project Explorer、工具栏、事件日志、分析指标、Limit State 等“台架测试”风格布局

## 项目结构

- `index.html`：页面结构与面板布局
- `styles.css`：暗色工业风 UI 样式
- `app.js`：Three.js 场景与数据生成、交互（orbit/cursor）以及读数/mini spectrum 绘制
- `vendor/three.module.min.js`：Three.js（本地 vendored）
- `server.mjs`：静态文件服务器（默认 `127.0.0.1:4173`）
- `verify.cjs`：测试/验证脚本（启动 server 后执行，产出截图并做像素统计）

## 启动

需要本机安装 Node.js（推荐 18+ / 20+）。

```sh
node server.mjs
```

然后打开：

```txt
http://127.0.0.1:4173
```

## 测试（可视化验证）

1. 先启动本地 server（见上）。
2. 另开一个终端执行：

```sh
node verify.cjs
```

脚本会生成：

- `verification-desktop.png`（桌面全页）
- `verification-chart.png`（图表区域裁剪）
- `verification-mobile.png`（移动端全页）

并在控制台输出统计结果；若发现控制台报错、WebGL/画布尺寸异常、颜色/亮度统计不达标或移动端布局溢出，则以非 0 退出码结束。
