import { bus } from './core/event.bus.js';
import { AppState } from './core/state.js';

// 临时挂载到 window 保证旧代码兼容性，重构完成后将移除
window.bus = bus;
window.AppState = AppState;

console.log('EDA 可视化协同 V4.0 模块化引擎启动成功！');
// TODO: 引入剩余的 app.controller.js 逻辑...
