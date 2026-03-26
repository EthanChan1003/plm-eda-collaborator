import { AppState } from '../core/state.js';

let scene, camera, renderer, controls;
let isThreeInitialized = false;

export function initThreeEngine(container) {
    if (isThreeInitialized) return;
    
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
}
