// ============ V4.7 Sidebar 渲染模块 - 反应式 UI ============
import { bus } from '../core/event.bus.js';
import { AppState } from '../core/state.js';
import { getAnnotations } from '../features/annotation.manager.js';
import { versionedComponentData } from '../data/mock.data.js';

// DOM 引用
let tabContent = null;
let currentDrawingType = AppState.currentDrawingType;
let currentTab = AppState.currentTab;

/**
 * 初始化 Sidebar 模块
 */
export function initSidebar() {
    tabContent = document.getElementById('tab-content');
    
    if (!tabContent) {
        console.warn('Sidebar: tab-content 元素未找到');
        return;
    }
    
    // 监听批注更新事件
    bus.on('ANNOTATIONS_UPDATED', () => {
        if (currentTab === 'notes') {
            renderNotesContent();
        }
    });
    
    // 监听视图切换
    bus.on('VIEW_CHANGED', (viewType) => {
        currentDrawingType = viewType;
        if (currentTab === 'tree') {
            renderTreeContent();
        }
    });
    
    // 监听 Tab 切换
    bus.on('TAB_CHANGED', (tabKey) => {
        currentTab = tabKey;
        switch (tabKey) {
            case 'tree':
                renderTreeContent();
                break;
            case 'notes':
                renderNotesContent();
                break;
        }
    });
    
    console.log('Sidebar 模块初始化完成');
}

/**
 * 渲染结构树内容
 */
export function renderTreeContent() {
    if (!tabContent) return;
    
    const canvasSchematic = document.getElementById('canvas-schematic');
    const canvasPcb = document.getElementById('canvas-pcb');
    
    if (currentDrawingType === 'schematic') {
        if (canvasSchematic) canvasSchematic.classList.remove('hidden');
        if (canvasPcb) canvasPcb.classList.add('hidden');
        
        let treeHTML = '<div class="space-y-3">';
        
        treeHTML += `
            <div>
                <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                    <i class="fas fa-bolt mr-2 text-yellow-500"></i>电源管理
                </div>
                <div class="ml-4 space-y-1 mt-1">
                    ${generateTreeItem('U2', 'AMS1117-3.3', 'microchip')}
                    ${generateTreeItem('C1', '100nF 去耦', 'bolt')}
                    ${generateTreeItem('C2', '10uF 滤波', 'bolt')}
                </div>
            </div>
        `;
        
        treeHTML += `
            <div>
                <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                    <i class="fas fa-microchip mr-2 text-blue-500"></i>核心 MCU
                </div>
                <div class="ml-4 space-y-1 mt-1">
                    ${generateTreeItem('U1', 'STM32F103', 'microchip', true)}
                </div>
            </div>
        `;
        
        treeHTML += `
            <div>
                <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                    <i class="fas fa-clock mr-2 text-purple-500"></i>时钟系统
                </div>
                <div class="ml-4 space-y-1 mt-1">
                    ${generateTreeItem('Y1', '8MHz 晶振', 'wave-square')}
                    ${generateTreeItem('C3', '22pF 负载', 'bolt')}
                </div>
            </div>
        `;
        
        treeHTML += `
            <div>
                <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                    <i class="fas fa-circle-notch mr-2 text-green-500"></i>外围电路
                </div>
                <div class="ml-4 space-y-1 mt-1">
                    ${generateTreeItem('R1', '10K 上拉', 'minus')}
                    ${generateTreeItem('R2', '4.7K 限流', 'minus')}
                    ${generateTreeItem('R3', '330R LED限流', 'minus')}
                    ${generateTreeItem('D1', 'LED 指示灯', 'lightbulb')}
                </div>
            </div>
        `;
        
        treeHTML += `
            <div>
                <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                    <i class="fas fa-plug mr-2 text-orange-500"></i>接口
                </div>
                <div class="ml-4 space-y-1 mt-1">
                    ${generateTreeItem('J1', 'SWD 4P 调试', 'plug')}
                </div>
            </div>
        `;
        
        treeHTML += '</div>';
        tabContent.innerHTML = treeHTML;
        
    } else {
        if (canvasSchematic) canvasSchematic.classList.add('hidden');
        if (canvasPcb) canvasPcb.classList.remove('hidden');
        
        tabContent.innerHTML = `
            <div class="space-y-3">
                <div>
                    <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                        <i class="fas fa-layer-group mr-2 text-gray-400"></i>图层管理
                    </div>
                    <div class="ml-4 space-y-1 mt-1">
                        <label class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" id="cb-layer-top" checked class="mr-3 w-3 h-3 accent-blue-600">
                            <span class="text-gray-600">Top Layer (顶层信号)</span>
                        </label>
                        <label class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" id="cb-layer-bottom" checked class="mr-3 w-3 h-3 accent-blue-600">
                            <span class="text-gray-600">Bottom Layer (底层信号)</span>
                        </label>
                        <label class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" id="cb-layer-silkscreen" checked class="mr-3 w-3 h-3 accent-blue-600">
                            <span class="text-gray-600">Top Silkscreen (丝印)</span>
                        </label>
                    </div>
                </div>
                <div class="mt-4">
                    <div class="flex items-center px-2 py-1 text-gray-700 font-bold text-[11px] uppercase tracking-tighter">
                        <i class="fas fa-ruler-combined mr-2 text-gray-400"></i>板框信息
                    </div>
                    <div class="ml-4 mt-2 text-xs text-gray-500">
                        <div>尺寸: 90mm x 70mm</div>
                        <div>层数: 2-Layer</div>
                        <div>板厚: 1.6mm</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    bindSvgEvents();
}

/**
 * 生成树形项目 HTML
 */
function generateTreeItem(ref, label, icon, isPrimary = false) {
    const data = versionedComponentData[AppState.currentVersion]?.[ref];
    if (!data) return '';
    const primaryClass = isPrimary ? 'text-blue-600 bg-blue-50/30' : 'text-gray-600';
    const iconClass = isPrimary ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-500';
    const partNumber = data.PartNumber?.split('-')[0] || 'N/A';
    return `
        <div class="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer ${primaryClass} group"
             onmouseover="highlightComponent('${ref}')"
             onmouseout="clearHighlight()"
             onclick="selectComponent('${ref}')">
            <i class="fas fa-${icon} w-5 ${iconClass}"></i>
            <span>${ref} (${partNumber})</span>
        </div>
    `;
}

/**
 * 渲染批注列表内容
 */
export function renderNotesContent() {
    if (!tabContent || currentTab !== 'notes') return;
    
    const isLatest = AppState.currentVersion === AppState.latestVersion;
    const versionAnnotations = getAnnotations(AppState.currentVersion);
    
    if (versionAnnotations.length === 0) {
        tabContent.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400">
                <i class="fas fa-comment-slash text-3xl mb-2"></i>
                <span class="text-xs">暂无批注</span>
                ${isLatest ? '<span class="text-[10px] mt-1">点击工具栏矩形框按钮添加批注</span>' : '<span class="text-[10px] mt-1">历史版本不可新增批注</span>'}
            </div>
        `;
        return;
    }
    
    let notesHTML = '<div class="space-y-2 p-2">';
    
    versionAnnotations.slice().reverse().forEach(note => {
        const viewLabel = note.viewType === 'schematic' ? '原理图' : 'PCB';
        const isResolved = note.status === 'resolved';
        const statusIcon = isResolved ? 'fa-check-circle text-green-500' : 'fa-circle text-blue-500';
        const cardBgClass = isResolved ? 'bg-gray-50' : 'bg-white';
        const textClass = isResolved ? 'line-through text-gray-400' : 'text-gray-600';
        const deleteBtn = isLatest ?
            `<i class="fas fa-trash text-xs cursor-pointer text-gray-400 hover:text-red-500 delete-btn" onclick="event.stopPropagation(); deleteAnnotation(${note.id}, '${note.version}')" title="删除批注"></i>` : '';
        const shortTime = note.time ? note.time.substring(5) : '';
        const safeAuthor = note.author || '系统';
        
        notesHTML += `
            <div class="note-item p-3 rounded-lg cursor-pointer border border-gray-100 ${cardBgClass}" data-note-id="${note.id}" data-note-version="${note.version}">
                <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center space-x-1.5 min-w-0">
                        <span class="flex-shrink-0 w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold">${note.id}</span>
                        <span class="font-bold text-gray-800 text-xs truncate max-w-[60px]" title="${safeAuthor}">${safeAuthor}</span>
                        <span class="flex-shrink-0 text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">${viewLabel}</span>
                    </div>
                    <div class="flex items-center space-x-2 flex-shrink-0 ml-1">
                        <span class="text-[9px] text-gray-400">${shortTime}</span>
                        <i class="fas ${statusIcon} text-xs cursor-pointer hover:opacity-70" onclick="event.stopPropagation(); toggleAnnotationStatus(${note.id}, '${note.version}')" title="${isResolved ? '已解决，点击恢复' : '待处理，点击解决'}"></i>
                        ${deleteBtn}
                    </div>
                </div>
                <div class="text-xs ${textClass} leading-relaxed line-clamp-2">${note.text}</div>
            </div>
        `;
    });
    
    notesHTML += '</div>';
    tabContent.innerHTML = notesHTML;
    
    // 绑定点击事件
    document.querySelectorAll('.note-item').forEach(item => {
        item.addEventListener('click', () => {
            const noteId = parseInt(item.getAttribute('data-note-id'));
            const noteVersion = item.getAttribute('data-note-version');
            window.locateAnnotation(noteId, noteVersion);
        });
    });
}

/**
 * 绑定 SVG 事件
 */
function bindSvgEvents() {
    const components = document.querySelectorAll('.eda-component');
    components.forEach(comp => {
        comp.addEventListener('click', (e) => {
            e.stopPropagation();
            const ref = comp.getAttribute('data-ref');
            if (window.selectComponent) {
                window.selectComponent(ref);
            }
        });
    });
}
