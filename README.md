# PLM-EDA Collaborator (EDA 可视化协同评审引擎)

![Version](https://img.shields.io/badge/version-V5.0-blue.svg)
![Architecture](https://img.shields.io/badge/architecture-EventBus%20%7C%20Modular-success.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 📖 项目简介

在现代产品生命周期管理（PLM）中，打破 ECAD（电子 CAD）与 MCAD（机械 CAD）之间的壁垒是提升研发效率的关键。**PLM-EDA Collaborator** 是一个专为 B2B 工业软件场景打造的纯前端、轻量级 EDA 可视化与协同评审引擎。

本项目在最新的 V5.0 版本中实现了 **100% 的模块化架构**，通过底层的 `EventBus` 实现了极低耦合的跨模块通信，提供了媲美专业桌面软件（如 Altium Designer）的丝滑交互体验。

## ✨ 核心特性

* **⚡️ 100% 模块化与事件驱动架构**
    * 彻底消灭上帝类，采用 `EventBus` 进行状态与事件的分发，实现高内聚低耦合。
* **🛠️ 双向视口无缝联动 (Bidirectional Sync)**
    * 2D 画布（原理图/PCB）与 3D 物理引擎实时空间映射。
    * 支持 Pan（平移）与 Zoom（缩放）的全维度同步，提供丝滑的机电协同审查体验。
* **📐 专业级 2D & 3D 渲染引擎**
    * **2D 引擎**：支持精准的数学缩放算法与图元定位。
    * **3D 引擎**：基于 `Three.js` 构建，支持 PCB 基板生成、元器件 3D 渲染与走线层映射，配备沉浸式 OrbitControls 操作。
* **💬 沉浸式评审与批注系统**
    * 支持在画布上直接框选并添加评审意见，数据按版本隔离。
    * 跨视图预警：原理图与 PCB 视图下的批注状态自动联动提醒。
* **🕰️ 数字主线与版本差分 (Diff)**
    * 内置组件级数据版本控制，支持秒级切换历史版本。
    * 图形化展示元器件的新增、修改、删除与位置变更。
* **💎 现代商业级 UI 与交互**
    * 基于 Tailwind CSS 打造的明亮、商务风格界面。
    * HUD 全局操作提示层与全局 Toast 状态反馈系统。
    * 支持一键生成专业级 PDF 评审报告。

## 🏗️ 核心架构与目录说明

项目采用 Vanilla JS (ES6 Modules) 构建，无需复杂的构建工具即可运行：

```text
📦 src
 ┣ 📂 core                  # 核心基础设施
 ┃ ┣ 📜 engine.2d.js        # 2D 交互与渲染引擎
 ┃ ┣ 📜 event.bus.js        # 全局事件总线 (核心脉络)
 ┃ ┗ 📜 state.js            # 全局轻量级状态机
 ┣ 📂 data
 ┃ ┗ 📜 mock.data.js        # 模拟工程数据与 Diff 库
 ┣ 📂 features              # 独立业务模块
 ┃ ┣ 📜 annotation.manager.js # 批注与跨视图定位
 ┃ ┣ 📜 export.pdf.js       # 评审报告生成
 ┃ ┣ 📜 mcad.3d.js          # Three.js 3D 渲染层
 ┃ ┣ 📜 search.manager.js   # 全局搜索中枢
 ┃ ┣ 📜 selection.manager.js# 图元选中与属性展示
 ┃ ┗ 📜 version.manager.js  # 数据版本与 Diff 调度
 ┣ 📂 ui                    # 视图层控制器
 ┃ ┣ 📜 layout.manager.js   # 布局与面板调度
 ┃ ┣ 📜 sidebar.js          # 左侧结构树渲染
 ┃ ┣ 📜 toast.manager.js    # 全局轻提示
 ┃ ┗ 📜 toolbar.js          # 顶部工具栏交互
 ┗ 📜 main.js               # 项目入口与模块点火器
```
## 🚀 快速启动
得益于纯天然的 ES6 Module 架构，本项目零依赖构建，开箱即用：

克隆本仓库到本地：

```bash
git clone https://github.com/ethanchan1003/plm-eda-collaborator.git
```
推荐使用 Live Server（VS Code 插件）或任何本地静态服务器打开项目根目录。

浏览器访问 index.html 即可体验。

## 🛠️ 技术栈
核心逻辑：Vanilla JavaScript (ES6+), Event-Driven Architecture

3D 引擎：Three.js

UI 样式：Tailwind CSS

图标库：FontAwesome

文档导出：html2pdf.js, html2canvas

## 🤝 参与贡献
欢迎提交 Issue 探讨基于 Web 的工业软件架构设计，或提交 Pull Request 共同完善功能。

Powered by passion for Industrial Software & Product Lifecycle Management.
