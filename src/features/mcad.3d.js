import { AppState } from '../core/state.js';
import { bus } from '../core/event.bus.js';
// === 新增：引入版本化的组件数据 ===
import { versionedComponentData } from '../data/mock.data.js';

// === 修改：提升作用域至模块顶部 ===
let scene, camera, renderer, controls;
let isThreeInitialized = false;
let pcbLayers3D = {
    top: new THREE.Group(),
    bottom: new THREE.Group()
};

// === 新增：机械外壳装配组 ===
let EnclosureGroup = null;
// ===============================

/**
 * 核心助手函数：支持穿透 Top/Bottom 两个组查找对应的元器件 Mesh
 */
function findMesh(ref) {
    // 检查容器是否存在
    if (!pcbLayers3D || !pcbLayers3D.top || !pcbLayers3D.bottom) return null;

    // 先在顶层组里找
    const topTarget = pcbLayers3D.top.children.find(c => c.userData && c.userData.ref === ref);
    if (topTarget) return topTarget;

    // 如果顶层没找到，去底层组里找
    const bottomTarget = pcbLayers3D.bottom.children.find(c => c.userData && c.userData.ref === ref);
    return bottomTarget || null;
}

export function initThreeEngine(container) {
    if (isThreeInitialized) return;

    // === 动态注入 3D 操作提示 (HUD) ===
    container.style.position = 'relative'; // 确保容器具有相对定位
    container.style.overflow = 'hidden';   // === 新增：防止内容溢出 ===

    const hintOverlay = document.createElement('div');
    // 使用 Tailwind 打造现代半透明磨砂玻璃质感
    hintOverlay.className = 'absolute bottom-4 right-4 z-50 pointer-events-none bg-gray-900/60 backdrop-blur-sm text-gray-200 text-[11px] px-3 py-2.5 rounded shadow-lg flex flex-col space-y-2 border border-white/10';
    hintOverlay.innerHTML = `
        <div class="flex items-center tracking-wider">
            <i class="fas fa-hand-pointer w-4 text-center mr-2 text-blue-400"></i>左键拖拽：旋转视角
        </div>
        <div class="flex items-center tracking-wider">
            <i class="fas fa-arrows-alt w-4 text-center mr-2 text-green-400"></i>右键拖拽：平移图纸
        </div>
        <div class="flex items-center tracking-wider">
            <i class="fas fa-search w-4 text-center mr-2 text-yellow-400"></i>滚轮滚动：缩放模型
        </div>
    `;
    container.appendChild(hintOverlay);
    // ==========================================

    // 1. 初始化场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#1e293b');

    // === 核心修复：确保容器被加入场景 ===
    scene.add(pcbLayers3D.top);
    scene.add(pcbLayers3D.bottom);
    // ===================================

    // 2. 初始化相机
    const width = container.clientWidth || 500;
    const height = container.clientHeight || 800;
    camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
    // === 优化初始坐标，更偏向俯视，减少大透视的倾斜感 ===
    camera.position.set(0, -300, 1000);
    // ===================================================

    // 3. 初始化渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 4. 添加灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); 
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6); 
    dirLight.position.set(200, -200, 600);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 5. 轨道控制器
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    // === 2D 与 3D 视口双向同步逻辑 (精准像素映射) ===
    let isUpdatingFrom2D = false;

    // 1. 3D 驱动 2D：通过 3D 相机距离反推 2D 的精确 Scale
    controls.addEventListener('change', () => {
        if (isUpdatingFrom2D) return;
        const currentDist = camera.position.distanceTo(controls.target);

        // 核心修正：利用视口高度和 FOV 反推精准的 2D Scale
        const containerHeight = renderer.domElement.clientHeight || 800;
        const fovRadian = (camera.fov * Math.PI) / 180;
        const exactScale = containerHeight / (2 * currentDist * Math.tan(fovRadian / 2));

        bus.emit('SYNC_3D_TO_2D', {
            scale: exactScale,
            targetX: controls.target.x,
            targetY: controls.target.y
        });
    });

    // 2. 2D 驱动 3D：通过 2D 的 Scale 反推 3D 相机的绝对物理距离
    bus.on('CANVAS_STATE_CHANGED', (payload) => {
        if (!AppState.isSplitViewActive || !payload || payload.source === '3D') return;
        isUpdatingFrom2D = true;

        // A. 同步缩放：数学绝对计算，确保 1 unit (3D) = 1 px (2D)
        const containerHeight = renderer.domElement.clientHeight || 800;
        const fovRadian = (camera.fov * Math.PI) / 180;
        const exactDist = containerHeight / (2 * payload.scale * Math.tan(fovRadian / 2));

        const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
        if (dir.lengthSq() === 0) dir.set(0, -1, 1).normalize();

        // B. 同步平移
        const newTargetX = -payload.translateX / payload.scale;
        const newTargetY = payload.translateY / payload.scale;
        const deltaX = newTargetX - controls.target.x;
        const deltaY = newTargetY - controls.target.y;

        controls.target.set(newTargetX, newTargetY, 0);
        camera.position.x += deltaX;
        camera.position.y += deltaY;

        // 沿视线方向绝对定位相机
        camera.position.copy(controls.target).add(dir.multiplyScalar(exactDist));
        controls.update();
        isUpdatingFrom2D = false;
    });

    // 3. 联动"适应屏幕"：仅重置 3D 视角方向，平移和距离依然由 2D 接管
    bus.on('ZOOM_RESET', () => {
        if (!AppState.isSplitViewActive || !camera || !controls) return;

        // 加上防死循环锁，防止相机角度改变触发 controls.change 反向污染 2D
        isUpdatingFrom2D = true;

        // 设定一个"不太倾斜"的标准工程视角向量
        const defaultDir = new THREE.Vector3(0, -300, 1000).normalize();

        // 核心：保持当前的焦点和相机距离，仅仅把相机的观察角度"拨"回标准位置
        const currentDist = camera.position.distanceTo(controls.target);
        camera.position.copy(controls.target).add(defaultDir.multiplyScalar(currentDist));

        controls.update();
        isUpdatingFrom2D = false;
    });

    // === 3D 交叉探测 (Cross-Probing) 高亮状态管理 ===
    let currentlySelected3DRef = null;

    function clear3DHighlight() {
        if (currentlySelected3DRef && scene) {
            const prevTarget = scene.children.find(child => child.userData && child.userData.ref === currentlySelected3DRef);
            if (prevTarget) {
                // 恢复器件原始的自发光材质（例如 LED D1 有红光，其他为黑）
                if (prevTarget.userData.origEmissive) {
                    prevTarget.material.emissive.copy(prevTarget.userData.origEmissive);
                } else {
                    prevTarget.material.emissive.setHex(0x000000);
                }
            }
            currentlySelected3DRef = null;
        }
    }

    // === 核心修复：从嵌套组中查找并高亮 ===
    bus.on('COMPONENT_SELECTED', (ref) => {
        if (!AppState.isSplitViewActive) return;
        
        // 1. 先重置所有高亮
        ['top', 'bottom'].forEach(l => pcbLayers3D[l].children.forEach(m => {
            if (m.material && m.material.emissive) m.material.emissive.setHex(0x000000);
        }));

        // 2. 深度查找目标 (findMesh 是我们之前定义的助手函数)
        const target = findMesh(ref);
        if (target && target.material) {
            // 缓存一下原始颜色（如果还没缓存过）
            if (!target.userData.origEmissive) {
                target.userData.origEmissive = target.material.emissive.clone();
            }
            target.material.emissive.setHex(0x3b82f6); // 赋予标志性的蓝色光晕
        }
    });

    // === 核心助手函数：重置所有 3D 实体的高亮状态 ===
    function resetAll3DHighlights() {
        if (!pcbLayers3D) return;
        
        ['top', 'bottom'].forEach(layerName => {
            const group = pcbLayers3D[layerName];
            group.children.forEach(mesh => {
                if (mesh.material && mesh.material.emissive) {
                    // 熄灭蓝色光晕
                    mesh.material.emissive.setHex(0x000000); 
                }
            });
        });
    }

    // 核心修复：使用更鲁棒的场景遍历重置法
    bus.on('CLEAR_SELECTION', () => {
        console.log("3D 引擎接收到 CLEAR_SELECTION 信号，开始全量重置材质");
        
        if (!scene) return;

        // 使用 traverse 深度遍历场景中所有的 Mesh
        scene.traverse((object) => {
            if (object.isMesh && object.userData && object.userData.ref) {
                // 如果是元器件，重置其自发光颜色
                if (object.material && object.material.emissive) {
                    // 彻底恢复黑色（关闭高亮）
                    object.material.emissive.setHex(0x000000); 
                }
            }
        });
    });

    // === 新增：监听预览状态清理事件 ===
    bus.on('CLEANUP_ALL_PREVIEWS', () => {
        console.log("3D 引擎接收到 CLEANUP_ALL_PREVIEWS 信号");
        
        if (!scene) return;

        // 清理所有预览状态（琥珀色发光）
        scene.traverse((object) => {
            if (object.isMesh && object.userData && object.userData.ref) {
                if (object.material && object.material.emissive) {
                    // 恢复原始发光颜色
                    if (object.userData.origEmissive) {
                        object.material.emissive.copy(object.userData.origEmissive);
                    } else {
                        object.material.emissive.setHex(0x000000);
                    }
                    
                    // 恢复不透明度
                    object.material.transparent = false;
                    object.material.opacity = 1;
                    
                    // 清理临时状态
                    delete object.userData.origPos;
                }
            }
        });
    });

    // === 监听图层显隐事件 ===
    bus.on('PCB_LAYER_TOGGLED', ({ layerName, isVisible }) => {
        if (pcbLayers3D[layerName]) {
            pcbLayers3D[layerName].visible = isVisible;
        }
    });
    // =======================

    // === 监听版本切换事件，实现 3D 视图同步 ===
    bus.on('VERSION_CHANGED', (newVersion) => {
        sync3DComponentsByVersion(newVersion);
    });

    // === 新增：监听 LOCATE_COMPONENT 事件，实现 3D 器件定位 ===
    bus.on('LOCATE_COMPONENT', ({ ref, targetX, targetY, scale }) => {
        if (!AppState.isSplitViewActive || !camera || !controls) return;
        
        // 将 2D 坐标转换为 3D 坐标
        const target3DX = (targetX - 500);
        const target3DY = (400 - targetY);
        
        // 计算相机距离（基于缩放级别）
        const containerHeight = renderer.domElement.clientHeight || 800;
        const fovRadian = (camera.fov * Math.PI) / 180;
        const targetScale = scale || 1.8;
        const exactDist = containerHeight / (2 * targetScale * Math.tan(fovRadian / 2));
        
        // 设置新的目标点
        controls.target.set(target3DX, target3DY, 0);
        
        // 重新定位相机
        const defaultDir = new THREE.Vector3(0, -300, 1000).normalize();
        camera.position.copy(controls.target).add(defaultDir.multiplyScalar(exactDist));
        
        controls.update();
        
        // 高亮目标器件
        const targetMesh = findMesh(ref);
        if (targetMesh && targetMesh.material) {
            if (!targetMesh.userData.origEmissive) {
                targetMesh.userData.origEmissive = targetMesh.material.emissive.clone();
            }
            targetMesh.material.emissive.setHex(0x3b82f6); // 蓝色高亮
        }
        
        console.log(`3D: 已定位到器件 ${ref} 位置 (${target3DX}, ${target3DY})`);
    });

    // 在初始化末尾立即执行一次同步，确保初始视图正确
    sync3DComponentsByVersion(AppState.currentVersion);
    // ==========================================

    // 6. 绘制 PCB 物理基板
    createPcbBoard();

    // 7. 绘制 3D 元器件
    createComponents();

    // 8. 生成 3D 走线网络
    createTraces(scene, pcbLayers3D);

    // === 新增：生成机械外壳 ===
    createMechanicalEnclosure();
    // ===========================

    // 9. 渲染循环
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // 10. ResizeObserver 实时监听容器变化
    const resizeObserver = new ResizeObserver(entries => {
        if (!AppState.isSplitViewActive || !camera || !renderer) return;
        for (let entry of entries) {
            const w = entry.contentRect.width;
            const h = entry.contentRect.height;
            if (w > 0 && h > 0) {
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                renderer.setSize(w, h);
            }
        }
    });
    resizeObserver.observe(container);

    // === 核心修复：支持穿透 Group 的射线检测 ===
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('click', (event) => {
        if (!AppState.isSplitViewActive) return;
        event.stopPropagation();

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        
        // 注意：第二个参数传 true，表示递归检测子对象（即 Group 里的 Mesh）
        const intersects = raycaster.intersectObjects(scene.children, true);
        
        // 过滤掉没有 ref 的对象（比如基板）以及外壳对象，只拿元器件
        const target = intersects.find(i => 
            i.object.userData && 
            i.object.userData.ref &&
            !i.object.userData.isEnclosure // 排除外壳，确保射线穿透
        );

        if (target) {
            const ref = target.object.userData.ref;
            // 调用全局选中函数，这样 2D 和属性面板也会跟着跳
            if (typeof window.selectComponent === 'function') {
                window.selectComponent(ref);
            }
        } else {
            // 点到背景或基板，取消选中
            if (typeof window.clearSelection === 'function') {
                window.clearSelection();
            }
        }
    });

    isThreeInitialized = true;
}

function createPcbBoard() {
    const boardWidth = 900;
    const boardHeight = 700;
    const boardThickness = 16; 
    const cornerRadius = 20;

    const shape = new THREE.Shape();

    const x = -boardWidth / 2;
    const y = -boardHeight / 2;
    shape.moveTo(x + cornerRadius, y);
    shape.lineTo(x + boardWidth - cornerRadius, y);
    shape.quadraticCurveTo(x + boardWidth, y, x + boardWidth, y + cornerRadius);
    shape.lineTo(x + boardWidth, y + boardHeight - cornerRadius);
    shape.quadraticCurveTo(x + boardWidth, y + boardHeight, x + boardWidth - cornerRadius, y + boardHeight);
    shape.lineTo(x + cornerRadius, y + boardHeight);
    shape.quadraticCurveTo(x, y + boardHeight, x, y + boardHeight - cornerRadius);
    shape.lineTo(x, y + cornerRadius);
    shape.quadraticCurveTo(x, y, x + cornerRadius, y);

    const holeCoords = [
        { x: -400, y: 300 },
        { x: 400, y: 300 },
        { x: -400, y: -300 },
        { x: 400, y: -300 }
    ];

    holeCoords.forEach(coord => {
        const hole = new THREE.Path();
        hole.absarc(coord.x, coord.y, 16, 0, Math.PI * 2, false);
        shape.holes.push(hole);
    });

    const extrudeSettings = {
        depth: boardThickness,
        bevelEnabled: false
    };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.translate(0, 0, -boardThickness / 2);

    const material = new THREE.MeshPhongMaterial({ 
        color: '#166534', 
        shininess: 40
    });
    
    const board = new THREE.Mesh(geometry, material);
    board.receiveShadow = true;
    board.castShadow = true;
    scene.add(board);
}

function createComponents() {
    // 新增 layer 参数，如果是 bottom 层，Z 轴坐标在板子下方 (-8以下)
    function svgTo3D(x, y, w, h, zThickness, layer = 'top') {
        const zDir = layer === 'bottom' ? -1 : 1;
        return {
            x: (x + w / 2) - 500,
            y: 400 - (y + h / 2),
            z: (8 + (zThickness / 2)) * zDir
        };
    }

    const componentsData = [
        { ref: 'U1', x: 350, y: 280, w: 160, h: 160, z: 12, color: '#1f2937', layer: 'top' },
        { ref: 'U2', x: 100, y: 140, w: 50,  h: 40,  z: 15, color: '#1f2937', layer: 'top' },
        { ref: 'J1', x: 100, y: 600, w: 50,  h: 80,  z: 85, color: '#f8fafc', layer: 'top' },
        { ref: 'Y1', x: 620, y: 290, w: 60,  h: 25,  z: 30, color: '#94a3b8', layer: 'top' },
        { ref: 'C1', x: 260, y: 300, w: 25,  h: 12,  z: 8,  color: '#b45309', layer: 'top' },
        { ref: 'C2', x: 260, y: 380, w: 30,  h: 14,  z: 10, color: '#b45309', layer: 'bottom' }, // 移至底层
        { ref: 'C3', x: 720, y: 290, w: 18,  h: 8,   z: 6,  color: '#b45309', layer: 'top' },
        { ref: 'C4', x: 170, y: 600, w: 25,  h: 12,  z: 8,  color: '#b45309', layer: 'bottom' }, // 移至底层
        { ref: 'R1', x: 620, y: 410, w: 30,  h: 12,  z: 6,  color: '#020617', layer: 'top' },
        { ref: 'R2', x: 620, y: 470, w: 30,  h: 12,  z: 6,  color: '#020617', layer: 'top' },
        { ref: 'R3', x: 760, y: 310, w: 30,  h: 12,  z: 6,  color: '#020617', layer: 'top' },
        { ref: 'D1', x: 860, y: 310, w: 30,  h: 14,  z: 12, color: '#ef4444', layer: 'top' },
        // === 新增：U3 芯片的三维物理定义 ===
        { ref: 'U3', x: 300, y: 150, w: 40, h: 40, z: 12, color: '#1e293b', layer: 'top' }
    ];

    componentsData.forEach(comp => {
        const pos = svgTo3D(comp.x, comp.y, comp.w, comp.h, comp.z, comp.layer);
        const geometry = new THREE.BoxGeometry(comp.w, comp.h, comp.z);

        const materialParams = { color: comp.color, shininess: 50 };
        if (comp.ref === 'D1') materialParams.emissive = new THREE.Color('#991b1b');

        const material = new THREE.MeshPhongMaterial(materialParams);
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { ref: comp.ref };

        // === 核心修改：根据器件所在的层级，将其加入到全局对应的图层容器中 ===
        if (typeof pcbLayers3D !== 'undefined' && pcbLayers3D[comp.layer]) {
            pcbLayers3D[comp.layer].add(mesh);
        } else {
            scene.add(mesh); // Fallback 防御
        }
    });
}

function createTraces(targetScene, layers3D) {
    function parsePathToLine(dStr, zPos, colorHex, targetGroup) {
        const points = [];
        const commands = dStr.split(/(?=[ML])/);
        commands.forEach(cmd => {
            const parts = cmd.trim().split(' ');
            if (parts.length >= 3) {
                const x = parseFloat(parts[1]) - 500;
                const y = 400 - parseFloat(parts[2]);
                points.push(new THREE.Vector3(x, y, zPos));
            }
        });

        if (points.length > 1) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: colorHex });
            const line = new THREE.Line(geometry, material);
            // === 核心修改：不再直接 add 到 scene，而是加到对应的层级 Group 中 ===
            targetGroup.add(line);
        }
    }

    // 将顶层走线加入 top Group
    const topPaths = document.querySelectorAll('#pcb-layer-top path');
    topPaths.forEach(p => {
        const d = p.getAttribute('d');
        if(d) parsePathToLine(d, 8.1, 0xef4444, layers3D.top);
    });

    // 将底层走线加入 bottom Group
    const bottomPaths = document.querySelectorAll('#pcb-layer-bottom path');
    bottomPaths.forEach(p => {
        const d = p.getAttribute('d');
        if(d) parsePathToLine(d, -8.1, 0x3b82f6, layers3D.bottom);
    });
}

/**
 * 根据传入的版本号同步 3D 视图中的组件显隐与位置
 */
function sync3DComponentsByVersion(version) {
    if (!pcbLayers3D) return;

    const currentVersionData = versionedComponentData[version] || {};

    // 遍历所有受管理的图层组（top 和 bottom）
    ['top', 'bottom'].forEach(layerKey => {
        const group = pcbLayers3D[layerKey];
        if (!group) return;

        group.children.forEach(mesh => {
            const ref = mesh.userData.ref;
            if (!ref) return;

            // 1. 同步显隐：如果该位号不在当前版本数据中，则隐藏
            const existsInVersion = ref in currentVersionData;
            mesh.visible = existsInVersion;

            // 2. 同步特殊位移：还原 V2.1 中 Y1 的位置变更逻辑
            if (ref === 'Y1') {
                if (version === 'V2.1') {
                    // 对应 2D 的 translate(-20, 0)，3D 中 X 轴减少 20 单位
                    // 注意：这里基于我们在 createComponents 中设定的初始位置进行偏移
                    mesh.position.x = 130; // 原始中心 150 - 20
                } else {
                    mesh.position.x = 150; // 恢复原始中心
                }
            }
        });
    });
}

export function toggleThreeSplitView(toolSplitView, view2dContainer, view3dContainer) {
    AppState.isSplitViewActive = !AppState.isSplitViewActive;

    if (AppState.isSplitViewActive) {
        toolSplitView.classList.add('bg-blue-50', 'text-blue-600');
        view2dContainer.style.flex = '0 0 50%';
        view3dContainer.style.width = '50%';

        if (!isThreeInitialized) {
            initThreeEngine(view3dContainer);
        }
    } else {
        toolSplitView.classList.remove('bg-blue-50', 'text-blue-600');
        view2dContainer.style.flex = '1';
        view3dContainer.style.width = '0';
    }

    // === 新增：监听容器的 CSS 过渡动画结束 (300ms) 后，自动触发自适应屏幕 ===
    setTimeout(() => {
        bus.emit('ZOOM_RESET');
    }, 310); // 稍微多给 10ms，确保浏览器重绘完成
    // =================================================================
}

// === 核心修复：IDX 变更的 3D 实体预览，支持穿透图层组查找 ===
bus.on('TOGGLE_IDX_PREVIEW_3D', ({ ref, dx, dy, isPreviewing }) => {
    // 使用统一的 findMesh 穿透查找对应的 3D 元器件
    const target = findMesh(ref);

    if (target) {
        if (isPreviewing) {
            // 保存原始状态
            if (!target.userData.origPos) target.userData.origPos = target.position.clone();
            if (!target.userData.origEmissive) target.userData.origEmissive = target.material.emissive.clone();

            // 3D 坐标系映射：Y 轴与 2D SVG 相反
            target.position.set(
                target.userData.origPos.x + dx,
                target.userData.origPos.y - dy,
                target.userData.origPos.z
            );

            // 设置半透明与发光材质表示这只是个"提议 (Ghost)"
            target.material.transparent = true;
            target.material.opacity = 0.6;
            target.material.emissive = new THREE.Color('#d97706'); // 琥珀色发光
        } else {
            // 恢复原始状态
            if (target.userData.origPos) target.position.copy(target.userData.origPos);
            if (target.userData.origEmissive) target.material.emissive.copy(target.userData.origEmissive);
            target.material.transparent = false;
            target.material.opacity = 1;
        }
    }
});

// ============ 机械外壳动态生成系统 ============

/**
 * 计算 PCBA 的 Z 轴最高点（用于确定上盖净空高度）
 * @returns {Object} 包含 maxZ 和 J1 器件信息的对象
 */
function calculateMaxZAndJ1Info() {
    // 基于场景中元器件数据计算 Z 轴最高点
    const componentsData = [
        { ref: 'U1', x: 350, y: 280, w: 160, h: 160, z: 12, layer: 'top' },
        { ref: 'U2', x: 100, y: 140, w: 50,  h: 40,  z: 15, layer: 'top' },
        { ref: 'J1', x: 100, y: 600, w: 50,  h: 80,  z: 85, layer: 'top' }, // 最高的器件
        { ref: 'Y1', x: 620, y: 290, w: 60,  h: 25,  z: 30, layer: 'top' },
        { ref: 'C1', x: 260, y: 300, w: 25,  h: 12,  z: 8,  layer: 'top' },
        { ref: 'C2', x: 260, y: 380, w: 30,  h: 14,  z: 10, layer: 'bottom' },
        { ref: 'C3', x: 720, y: 290, w: 18,  h: 8,   z: 6,  layer: 'top' },
        { ref: 'C4', x: 170, y: 600, w: 25,  h: 12,  z: 8,  layer: 'bottom' },
        { ref: 'R1', x: 620, y: 410, w: 30,  h: 12,  z: 6,  layer: 'top' },
        { ref: 'R2', x: 620, y: 470, w: 30,  h: 12,  z: 6,  layer: 'top' },
        { ref: 'R3', x: 760, y: 310, w: 30,  h: 12,  z: 6,  layer: 'top' },
        { ref: 'D1', x: 860, y: 310, w: 30,  h: 14,  z: 12, layer: 'top' },
        { ref: 'U3', x: 300, y: 150, w: 40, h: 40, z: 12, layer: 'top' }
    ];

    let maxZ = 0;
    let j1Info = null;

    componentsData.forEach(comp => {
        // Z 轴最大值（顶层器件）
        if (comp.layer === 'top') {
            const topZ = 8 + comp.z; // PCB 表面 Z 坐标 + 器件高度
            maxZ = Math.max(maxZ, topZ);
        }
        
        // 记录 J1 信息（用于侧壁开孔）
        if (comp.ref === 'J1') {
            const j1_3D_x = (comp.x + comp.w / 2) - 500;
            const j1_3D_y = 400 - (comp.y + comp.h / 2);
            j1Info = {
                x: j1_3D_x,
                y: j1_3D_y,
                w: comp.w,
                h: comp.h,
                z: comp.z,
                // 判断 J1 靠近哪个板边
                nearEdge: Math.abs(j1_3D_y - (-350)) < Math.abs(j1_3D_y - 350) ? 'front' : 'back'
            };
        }
    });

    return { maxZ, j1Info };
}

/**
 * 创建机械外壳（底座 + 上盖 + 支撑柱）
 * 核心修正：基于 PCB 板框尺寸（而非器件包围盒）生成外壳
 */
function createMechanicalEnclosure() {
    // 1. 创建独立的装配组
    EnclosureGroup = new THREE.Group();
    EnclosureGroup.name = 'EnclosureGroup';

    // === 核心修复：固化 PCB 物理板框尺寸作为外壳基准 ===
    // PCB 板框在 createPcbBoard() 中定义为 900x700，中心对齐到场景原点
    const PCB_PHYSICAL_W = 900;
    const PCB_PHYSICAL_H = 700;
    // ===========================================================

    // 2. 计算 Z 轴最高点（用于确定上盖净空）和 J1 信息
    const { maxZ, j1Info } = calculateMaxZAndJ1Info();
    
    // 安装间距和安全净空
    const marginXY = 5; // XY 平面安装间距 (mm)
    const clearanceZ = 4; // Z 轴安全净空 (mm)
    
    // === 外壳内腔尺寸：基于 PCB 板框 ===
    const innerWidth = PCB_PHYSICAL_W + marginXY * 2;
    const innerHeight = PCB_PHYSICAL_H + marginXY * 2;
    const innerDepth = maxZ + clearanceZ; // 上盖内部净空高度
    // ===================================

    // 外壳壁厚
    const wallThickness = 2;
    const baseThickness = 10; // 底座厚度
    const coverThickness = 10; // 上盖厚度
    
    // PCB 厚度
    const pcbThickness = 16;

    // 3. 创建半透明底座
    const baseMaterial = new THREE.MeshPhongMaterial({
        color: 0x60a5fa, // 深灰色
        transparent: true,
        opacity: 0.5,    // 调试期稍微调高一点，确认能看见后再调低
        side: THREE.DoubleSide,
        shininess: 30,
        depthWrite: false
    });

    const baseOuterW = innerWidth + wallThickness * 2;
    const baseOuterH = innerHeight + wallThickness * 2;
    const baseGeometry = new THREE.BoxGeometry(baseOuterW, baseOuterH, baseThickness);
    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    
    // 绝对居中对齐：X/Y 轴 position 设为 0
    baseMesh.position.set(0, 0, -pcbThickness / 2 - baseThickness / 2 - 2);
    baseMesh.receiveShadow = true;
    baseMesh.userData.isEnclosure = true;
    EnclosureGroup.add(baseMesh);

    // 4. 创建四个支撑柱（Standoffs）
    const standoffMaterial = new THREE.MeshPhongMaterial({
        color: 0x9ca3af, // 改为银灰色，模拟金属铜柱，更显眼
        transparent: true,
        opacity: 0.8,
        depthWrite: false
    });
    const standoffRadius = 8; // 稍微加粗一点方便看清
    const standoffHeight = 24; // 稍微撑高一点
    const standoffGeometry = new THREE.CylinderGeometry(standoffRadius, standoffRadius, standoffHeight, 16);

const standoffPositions = [
        { x: -400, y: -300 }, // 左前
        { x: 400, y: -300 },  // 右前
        { x: -400, y: 300 },  // 左后
        { x: 400, y: 300 }    // 右后
    ];

    standoffPositions.forEach(pos => {
        const standoff = new THREE.Mesh(standoffGeometry, standoffMaterial);
        
        // === 核心修复：将横躺的圆柱体竖起来！ ===
        standoff.rotation.x = Math.PI / 2; 
        
        // Z 轴高度计算：PCB 底面往下走 半个柱子的高度
        standoff.position.set(pos.x, pos.y, -pcbThickness / 2 - standoffHeight / 2);
        standoff.userData.isEnclosure = true;
        EnclosureGroup.add(standoff);
    });

    // 5. 创建半透明上盖 (拼装空心壳体)
    const coverMaterial = new THREE.MeshPhongMaterial({
        color: 0x60a5fa, // 工业浅蓝色
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        shininess: 80,
        depthWrite: true // 关闭深度写入，解决半透明渲染脏斑
    });

    const coverGroup = new THREE.Group();
    const outerW = innerWidth + wallThickness * 2;
    const outerH = innerHeight + wallThickness * 2;
    
    // 5.1 顶盖 (Roof)
    const roofGeo = new THREE.BoxGeometry(outerW, outerH, coverThickness);
    const roof = new THREE.Mesh(roofGeo, coverMaterial);
    roof.position.set(0, 0, innerDepth + coverThickness / 2);
    roof.userData.isEnclosure = true;
    coverGroup.add(roof);

    // 5.2 左侧壁
    const leftWallGeo = new THREE.BoxGeometry(wallThickness, outerH, innerDepth);
    const leftWall = new THREE.Mesh(leftWallGeo, coverMaterial);
    leftWall.position.set(-innerWidth / 2 - wallThickness / 2, 0, innerDepth / 2);
    leftWall.userData.isEnclosure = true;
    coverGroup.add(leftWall);

    // 5.3 右侧壁
    const rightWallGeo = new THREE.BoxGeometry(wallThickness, outerH, innerDepth);
    const rightWall = new THREE.Mesh(rightWallGeo, coverMaterial);
    rightWall.position.set(innerWidth / 2 + wallThickness / 2, 0, innerDepth / 2);
    rightWall.userData.isEnclosure = true;
    coverGroup.add(rightWall);

    // 5.4 前侧壁 (Y 负方向) - J1 开孔侧
    // === J1 侧壁开孔逻辑 ===
    // J1 位于 y:600 (2D坐标)，转换后 3D Y 坐标约为 -200，靠近前侧壁 (Y = -350)
    if (j1Info && j1Info.nearEdge === 'front') {
        // 创建带开孔的前侧壁：使用 CSG 或 分段侧壁
        // 方案：分左右两段，中间留出 J1 伸出空间
        const j1PortWidth = j1Info.w + 6; // 开孔宽度比 J1 宽 6mm
        const j1PortHeight = j1Info.z + 4; // 开孔高度比 J1 高 4mm
        const j1PortCenterX = j1Info.x; // J1 的 X 坐标
        
        // 左段：J1 左侧
        const leftSegWidth = (innerWidth / 2 + j1PortCenterX) - j1PortWidth / 2;
        if (leftSegWidth > 0) {
            const leftSegGeo = new THREE.BoxGeometry(leftSegWidth, wallThickness, innerDepth);
            const leftSeg = new THREE.Mesh(leftSegGeo, coverMaterial);
            leftSeg.position.set(
                -innerWidth / 2 + leftSegWidth / 2,
                -innerHeight / 2 - wallThickness / 2,
                innerDepth / 2
            );
            leftSeg.userData.isEnclosure = true;
            coverGroup.add(leftSeg);
        }
        
        // 右段：J1 右侧
        const rightSegWidth = (innerWidth / 2 - j1PortCenterX) - j1PortWidth / 2;
        if (rightSegWidth > 0) {
            const rightSegGeo = new THREE.BoxGeometry(rightSegWidth, wallThickness, innerDepth);
            const rightSeg = new THREE.Mesh(rightSegGeo, coverMaterial);
            rightSeg.position.set(
                innerWidth / 2 - rightSegWidth / 2,
                -innerHeight / 2 - wallThickness / 2,
                innerDepth / 2
            );
            rightSeg.userData.isEnclosure = true;
            coverGroup.add(rightSeg);
        }
        
        // 上段：J1 上方（开孔顶部到外壳顶部）
        const topSegHeight = innerDepth - j1PortHeight;
        if (topSegHeight > 0) {
            const topSegGeo = new THREE.BoxGeometry(j1PortWidth, wallThickness, topSegHeight);
            const topSeg = new THREE.Mesh(topSegGeo, coverMaterial);
            topSeg.position.set(
                j1PortCenterX,
                -innerHeight / 2 - wallThickness / 2,
                innerDepth - topSegHeight / 2
            );
            topSeg.userData.isEnclosure = true;
            coverGroup.add(topSeg);
        }
        
        console.log('[MCAD] J1 侧壁开孔已生成，位置: 前侧壁，开孔宽度:', j1PortWidth, 'mm');
    } else {
        // 无开孔：完整前侧壁
        const frontWallGeo = new THREE.BoxGeometry(innerWidth, wallThickness, innerDepth);
        const frontWall = new THREE.Mesh(frontWallGeo, coverMaterial);
        frontWall.position.set(0, -innerHeight / 2 - wallThickness / 2, innerDepth / 2);
        frontWall.userData.isEnclosure = true;
        coverGroup.add(frontWall);
    }

    // 5.5 后侧壁 (Y 正方向)
    const backWallGeo = new THREE.BoxGeometry(innerWidth, wallThickness, innerDepth);
    const backWall = new THREE.Mesh(backWallGeo, coverMaterial);
    backWall.position.set(0, innerHeight / 2 + wallThickness / 2, innerDepth / 2);
    backWall.userData.isEnclosure = true;
    coverGroup.add(backWall);

    // 将组装好的空心上盖加入总装配组
    coverGroup.userData.isEnclosure = true;
    EnclosureGroup.add(coverGroup);

    // 6. 将装配组添加到场景
    scene.add(EnclosureGroup);

    // 7. 初始状态：默认隐藏
    EnclosureGroup.visible = false;

    console.log('[MCAD] 机械外壳已生成（基于 PCB 板框基准）', {
        pcbSize: `${PCB_PHYSICAL_W} x ${PCB_PHYSICAL_H}`,
        innerCavity: `${innerWidth.toFixed(1)} x ${innerHeight.toFixed(1)} x ${innerDepth.toFixed(1)}`,
        maxComponentZ: maxZ.toFixed(1),
        j1Opening: j1Info ? `前侧壁 @ X=${j1Info.x.toFixed(1)}` : '无'
    });
}

// === 监听外壳显隐切换事件 ===
bus.on('TOGGLE_MECHANICAL_ENCLOSURE', () => {
    if (EnclosureGroup) {
        EnclosureGroup.visible = !EnclosureGroup.visible;
        console.log('[MCAD] 外壳可见性切换为:', EnclosureGroup.visible);
    }
});
