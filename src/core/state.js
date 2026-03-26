export const AppState = {
    currentVersion: 'V2.1',
    latestVersion: 'V2.1',
    currentDrawingType: 'schematic', // 'schematic' 或 'pcb'
    currentTab: 'tree',              // 'tree', 'diff', 'collab', 'notes'
    currentToolMode: 'SELECT',       // 'SELECT', 'PAN', 'ANNOTATE'
    isSplitViewActive: false,
    pcbLayerState: {
        top: true,
        bottom: true,
        silkscreen: true
    }
};
