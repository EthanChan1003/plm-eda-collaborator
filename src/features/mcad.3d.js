import { AppState } from '../core/state.js';
import { bus } from '../core/event.bus.js';

let scene, camera, renderer, controls;
let isThreeInitialized = false;

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

    // 2. 初始化相机
    const width = container.clientWidth || 500;
    const height = container.clientHeight || 800;
    camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
    camera.position.set(0, -900, 1100);

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

    // === 2D 与 3D 视口双向同步逻辑 (升级平移支持) ===
    const INITIAL_DISTANCE = camera.position.distanceTo(controls.target);
    let isUpdatingFrom2D = false;

    // 1. 3D 驱动 2D：同时广播缩放比例与相机焦点位置
    controls.addEventListener('change', () => {
        if (isUpdatingFrom2D) return;
        const currentDist = camera.position.distanceTo(controls.target);
        const scale = INITIAL_DISTANCE / currentDist;

        bus.emit('SYNC_3D_TO_2D', {
            scale: scale,
            targetX: controls.target.x,
            targetY: controls.target.y
        });
    });

    // 2. 2D 驱动 3D：接收并解析 2D 画布的缩放与平移状态
    bus.on('CANVAS_STATE_CHANGED', (payload) => {
        if (!AppState.isSplitViewActive || !payload || payload.source === '3D') return;
        isUpdatingFrom2D = true;

        // A. 同步缩放
        const targetDist = INITIAL_DISTANCE / payload.scale;
        const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
        if (dir.lengthSq() === 0) dir.set(0, -1, 1).normalize();

        // B. 同步平移 (坐标系映射算法)
        // 2D 右移(translateX为正) -> 3D 相机需向左(target.x为负)
        // 2D 下移(translateY为正) -> 3D Y轴向上，相机需向上(target.y为正)
        const newTargetX = -payload.translateX / payload.scale;
        const newTargetY = payload.translateY / payload.scale;

        const deltaX = newTargetX - controls.target.x;
        const deltaY = newTargetY - controls.target.y;

        // 更新焦点
        controls.target.set(newTargetX, newTargetY, 0);

        // 相机跟随焦点平移，保持原有视角
        camera.position.x += deltaX;
        camera.position.y += deltaY;

        // 沿视线方向推拉相机应用缩放
        camera.position.copy(controls.target).add(dir.multiplyScalar(targetDist));

        controls.update();
        isUpdatingFrom2D = false;
    });

    // 3. 联动"适应屏幕"重置按钮
    bus.on('ZOOM_RESET', () => {
        if (!AppState.isSplitViewActive) return;
        isUpdatingFrom2D = true;
        camera.position.set(0, -900, 1100); // 恢复初始相机位置
        controls.target.set(0, 0, 0);       // 恢复初始聚焦点
        controls.update();
        isUpdatingFrom2D = false;
    });

    // 6. 绘制 PCB 物理基板
    createPcbBoard();
    
    // 7. 绘制 3D 元器件
    createComponents();
    
    // 8. 生成 3D 走线网络
    createTraces();

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

    // 11. 3D 交互引擎 (Raycaster)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('click', (event) => {
        if (!AppState.isSplitViewActive) return;
        event.stopPropagation();

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            const target = intersects.find(intersect => intersect.object.userData && intersect.object.userData.ref);
            if (target) {
                const ref = target.object.userData.ref;
                if (typeof window.selectComponent === 'function') {
                    window.selectComponent(ref);
                }
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
    function svgTo3D(x, y, w, h, zThickness) {
        return {
            x: (x + w / 2) - 500,
            y: 400 - (y + h / 2),
            z: 8 + (zThickness / 2)
        };
    }

    const componentsData = [
        { ref: 'U1', x: 350, y: 280, w: 160, h: 160, z: 12, color: '#1f2937' },
        { ref: 'U2', x: 100, y: 140, w: 50,  h: 40,  z: 15, color: '#1f2937' },
        { ref: 'J1', x: 100, y: 600, w: 50,  h: 80,  z: 85, color: '#f8fafc' },
        { ref: 'Y1', x: 620, y: 290, w: 60,  h: 25,  z: 30, color: '#94a3b8' },
        { ref: 'C1', x: 260, y: 300, w: 25,  h: 12,  z: 8,  color: '#b45309' },
        { ref: 'C2', x: 260, y: 380, w: 30,  h: 14,  z: 10, color: '#b45309' },
        { ref: 'C3', x: 720, y: 290, w: 18,  h: 8,   z: 6,  color: '#b45309' },
        { ref: 'C4', x: 170, y: 600, w: 25,  h: 12,  z: 8,  color: '#b45309' },
        { ref: 'R1', x: 620, y: 410, w: 30,  h: 12,  z: 6,  color: '#020617' },
        { ref: 'R2', x: 620, y: 470, w: 30,  h: 12,  z: 6,  color: '#020617' },
        { ref: 'R3', x: 760, y: 310, w: 30,  h: 12,  z: 6,  color: '#020617' },
        { ref: 'D1', x: 860, y: 310, w: 30,  h: 14,  z: 12, color: '#ef4444' }
    ];

    componentsData.forEach(comp => {
        const pos = svgTo3D(comp.x, comp.y, comp.w, comp.h, comp.z);
        const geometry = new THREE.BoxGeometry(comp.w, comp.h, comp.z);
        
        const materialParams = { color: comp.color, shininess: 50 };
        if (comp.ref === 'D1') materialParams.emissive = new THREE.Color('#991b1b');
        
        const material = new THREE.MeshPhongMaterial(materialParams);
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { ref: comp.ref };
        
        scene.add(mesh);
    });
}

function createTraces() {
    function parsePathToLine(dStr, zPos, colorHex) {
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
            scene.add(line);
        }
    }

    const topPaths = document.querySelectorAll('#pcb-layer-top path');
    topPaths.forEach(p => {
        const d = p.getAttribute('d');
        if(d) parsePathToLine(d, 8.1, 0xef4444);
    });

    const bottomPaths = document.querySelectorAll('#pcb-layer-bottom path');
    bottomPaths.forEach(p => {
        const d = p.getAttribute('d');
        if(d) parsePathToLine(d, -8.1, 0x3b82f6);
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

// 监听：IDX 变更的 3D 实体预览
bus.on('TOGGLE_IDX_PREVIEW_3D', ({ ref, dx, dy, isPreviewing }) => {
    if (!scene) return;
    const target = scene.children.find(child => child.userData && child.userData.ref === ref);

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
