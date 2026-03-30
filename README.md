# PLM-EDA Collaborator (EDA 可视化协同评审引擎)

![Version](https://img.shields.io/badge/version-V5.0-blue.svg)
![Architecture](https://img.shields.io/badge/architecture-EventBus%20%7C%20Modular-success.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 📖 项目简介

在现代产品生命周期管理（PLM）中，打破 ECAD（电子 CAD）与 MCAD（机械 CAD）之间的壁垒是提升研发效率的关键。**PLM-EDA Collaborator** 是一个专为 B2B 工业软件场景打造的纯前端、轻量级 EDA 可视化与协同评审引擎。

本项目在最新的 V5.0 版本中实现了 **100% 的模块化架构**，通过底层的 `EventBus` 实现了极低耦合的跨模块通信，提供了媲美专业桌面软件（如 Altium Designer）的丝滑交互体验。

## ✨ 核心特性

### 🚀 1. 2D/3D 机电双向联动

* **无缝分屏**：一键开启 2D 图纸与 3D 物理基板的左右分屏协同视图。
* **数字孪生映射**：自动解析 2D SVG 坐标与走线，通过 Three.js 引擎动态“挤压”生成带有精确厚度、物理倒角和过孔的 3D 高保真PCB板。
* **光线追踪拾取**：内置 Raycaster 引擎，在 3D 空间中点击任意元器件（如引发干涉的高耸排针），2D 图纸与属性面板将瞬间同步高亮联动。

### 📝 2. 沉浸式图纸评审与批注

* **跨视图预警**：支持在原理图与 PCB 画布上打点批注。当问题器件跨视图时，系统提供“呼吸灯”级别的视觉干涉预警。
* **空间追溯**：点击批注列表项，画布自动平滑漫游（Pan & Zoom）并精准居中聚焦问题元器件。

### ⏳ 3. 多版本时间轴与差异比对

* **数据驱动**：原生支持 V1.0 到最新版本的全景追溯。
* **智能 Diff**：一键高亮呈现器件的“新增（绿）”、“删除（红）”、“修改（黄）”与“位置偏移（残影与轨迹箭头）”。

### 📊 4. 图层引擎与报告导出

* **图层切换**：丝滑的PCB图层过滤机制。
* **变更报告导出**：内置 `html2canvas` 与 `html2pdf`，一键提取画布超清快照，自动排版并生成包含评审数据的 A4 标准 PDF 评审报告。

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

## 📸 界面预览
 |                    2D/3D 机电协同双向联动                    |                     沉浸式图纸批注与预警                     |
| :----------------------------------------------------------: | :----------------------------------------------------------: |
| <img width="400" src="https://github.com/user-attachments/assets/0269604b-60e9-48a3-bd48-e5c5876df9e2" /> | <img width="400" src="https://github.com/user-attachments/assets/4d3741ba-bb19-465b-b7dc-7fe44f25b4d6" />|
|                 **智能版本差异 (Diff) 呈现**                 |                  **一键生成 PDF 评审报告**                   |
| <img width="400" src="https://github.com/user-attachments/assets/e816e7ff-81fa-41f5-998a-fdf3470056bc" />| <img width="400" src="https://github.com/user-attachments/assets/2983338d-ad92-4230-be16-aec28c90670f" />|


## 🚀 快速启动
得益于纯天然的 ES6 Module 架构，本项目零依赖构建，开箱即用：

1. **克隆项目**

   ```Bash
   git clone https://github.com/ethanchan1003/eda-collaborator.git
   ```

2. **启动本地服务器**

   - 如果使用 VS Code，推荐安装 `Live Server` 插件，右键 `index.html` 点击 "Open with Live Server"。

   - 或者使用 Python 自带服务器：

     ```Bash
     python -m http.server 8000
     ```

3. **访问引擎** 打开浏览器访问 `http://localhost:8000`，开始享受丝滑的机电协同体验。

## 🛠️ 技术栈
核心逻辑：Vanilla JavaScript (ES6+), Event-Driven Architecture

3D 引擎：Three.js

UI 样式：Tailwind CSS

图标库：FontAwesome

文档导出：html2pdf.js, html2canvas

## 🗺️ 演进路线图

- [x] **V1.0 - V2.0**：完成基础的 SVG 2D 渲染、图层隔离与属性映射。
- [x] **V3.0**：引入 Three.js，实现 3D 物理基板挤压映射与跨维联动。
- [x] **V4.0**：ES6 模块化架构重构，引入 EventBus 实现解耦。
- [ ] **V5.0 (In Progress)**：引入基于 **EDMD/IDX 协议**的增量设计协同时间轴，实现提议审查与预览。

## 🤝 参与贡献
欢迎提交 Issue 探讨基于 Web 的工业软件架构设计，或提交 Pull Request 共同完善功能。

Powered by passion for Industrial Software & Product Lifecycle Management.
