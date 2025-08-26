// home.js
const m = window.m;

const DrawLayer = {
  oninit(vnode) {
    this.canvas = null;
    this.ctx = null;
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
  },

  oncreate(vnode) {
    this.canvas = vnode.dom;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  },

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  },

  startDrawing(e, attrs) {
    const { layer, tool, isActive } = attrs;
    if (!isActive || !layer.visible) return;

    this.isDrawing = true;
    const pos = this.getMousePos(e);
    this.lastX = pos.x;
    this.lastY = pos.y;

    e.preventDefault();
  },

  draw(e, attrs) {
    const { layer, tool, brushSize, color, isActive } = attrs;
    if (!this.isDrawing || !isActive || !layer.visible) return;

    const pos = this.getMousePos(e);

    this.ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    this.ctx.strokeStyle = tool === 'pen' ? color : 'rgba(0,0,0,1)';
    this.ctx.lineWidth = brushSize;

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();

    this.lastX = pos.x;
    this.lastY = pos.y;

    e.preventDefault();
  },

  stopDrawing(e) {
    this.isDrawing = false;
    e && e.preventDefault();
  },

  clear(attrs) {
    if (this.ctx) {
      const { canvasWidth, canvasHeight } = attrs;
      this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
  },

  view(vnode) {
    const { layer, tool, canvasWidth, canvasHeight, zIndex, isActive } = vnode.attrs;

    return m('canvas', {
      width: canvasWidth,
      height: canvasHeight,
      style: `
        position: absolute;
        top: 0;
        left: 0;
        z-index: ${zIndex};
        display: ${layer.visible ? 'block' : 'none'};
        cursor: ${tool === 'pen' ? 'crosshair' : 'grab'};
        pointer-events: ${isActive ? 'auto' : 'none'};
      `,
      onmousedown: (e) => this.startDrawing(e, vnode.attrs),
      onmousemove: (e) => this.draw(e, vnode.attrs),
      onmouseup: (e) => this.stopDrawing(e),
      onmouseleave: (e) => this.stopDrawing(e)
    });
  }
};

const HomePage = {
  oninit(vnode) {
    this.layers = [
      { id: 1, name: 'Layer 1', visible: true }
    ];
    this.activeLayerId = 1;
    this.nextLayerId = 2;
    this.layerRefs = new Map(); // Store references to DrawLayer components

    this.tool = 'pen'; // 'pen' or 'eraser'
    this.brushSize = 5;
    this.color = '#000000';

    this.canvasWidth = 800;
    this.canvasHeight = 600;
  },

  getActiveLayer() {
    return this.layers.find(layer => layer.id === this.activeLayerId);
  },

  addLayer() {
    const newLayer = {
      id: this.nextLayerId++,
      name: `Layer ${this.nextLayerId - 1}`,
      visible: true
    };
    this.layers.push(newLayer);
    this.activeLayerId = newLayer.id;
  },

  removeLayer() {
    if (this.layers.length <= 1) return; // Keep at least one layer

    const index = this.layers.findIndex(layer => layer.id === this.activeLayerId);
    this.layers.splice(index, 1);

    // Remove reference
    this.layerRefs.delete(this.activeLayerId);

    // Set active layer to the previous one or first available
    if (index > 0) {
      this.activeLayerId = this.layers[index - 1].id;
    } else {
      this.activeLayerId = this.layers[0].id;
    }
  },

  toggleLayerVisibility(layerId) {
    const layer = this.layers.find(l => l.id === layerId);
    if (layer) {
      layer.visible = !layer.visible;
    }
  },

  clearActiveLayer() {
    const activeLayerRef = this.layerRefs.get(this.activeLayerId);
    if (activeLayerRef) {
      activeLayerRef.clear();
    }
  },

  view(vnode) {
    return m('.max-w-6xl.mx-auto.px-4.py-8', [
      m('h1.text-3xl.font-bold.text-gray-900.text-center.mb-8', 'Paint Demo'),

      // Toolbar
      m('.bg-gray-100.p-4.rounded-lg.mb-4.flex.flex-wrap.gap-4.items-center', [
        // Tool selection
        m('.flex.gap-2', [
          m('label.text-sm.font-medium', 'Tool:'),
          m('button.px-3.py-1.rounded.text-sm', {
            class: this.tool === 'pen' ? 'bg-blue-500.text-white' : 'bg-white.border',
            onclick: () => { this.tool = 'pen'; }
          }, 'Pen'),
          m('button.px-3.py-1.rounded.text-sm', {
            class: this.tool === 'eraser' ? 'bg-blue-500.text-white' : 'bg-white.border',
            onclick: () => { this.tool = 'eraser'; }
          }, 'Eraser')
        ]),

        // Color picker (only for pen)
        this.tool === 'pen' ? m('.flex.gap-2.items-center', [
          m('label.text-sm.font-medium', 'Color:'),
          m('input[type=color]', {
            value: this.color,
            onchange: (e) => { this.color = e.target.value; }
          })
        ]) : null,

        // Brush size
        m('.flex.gap-2.items-center', [
          m('label.text-sm.font-medium', 'Size:'),
          m('input[type=range]', {
            min: 1,
            max: 50,
            value: this.brushSize,
            onchange: (e) => { this.brushSize = parseInt(e.target.value); }
          }),
          m('span.text-sm.w-8', this.brushSize + 'px')
        ]),

        // Clear button
        m('button.px-3.py-1.bg-red-500.text-white.rounded.text-sm', {
          onclick: () => this.clearActiveLayer()
        }, 'Clear Layer')
      ]),

      // Main content area
      m('.flex.gap-4', [
        // Canvas area
        m('.flex-1', [
          m('.relative.border-2.border-gray-300.bg-white.inline-block', {
            style: `width: ${this.canvasWidth}px; height: ${this.canvasHeight}px;`
          }, [
            // Render all layers with proper z-index stacking
            this.layers.map((layer, index) => {
              const isActive = layer.id === this.activeLayerId;
              return m(DrawLayer, {
                key: layer.id,
                layer: layer,
                tool: this.tool,
                brushSize: this.brushSize,
                color: this.color,
                canvasWidth: this.canvasWidth,
                canvasHeight: this.canvasHeight,
                zIndex: index + 1,
                isActive: isActive,
                oncreate: (layerVnode) => {
                  // Store reference to the DrawLayer component
                  this.layerRefs.set(layer.id, layerVnode.state);
                },
                onremove: () => {
                  // Clean up reference when layer is removed
                  this.layerRefs.delete(layer.id);
                }
              });
            })
          ])
        ]),

        // Layer panel
        m('.w-64.bg-gray-50.p-4.rounded-lg', [
          m('.flex.justify-between.items-center.mb-4', [
            m('h3.font-medium', 'Layers'),
            m('button.px-2.py-1.bg-blue-500.text-white.rounded.text-sm', {
              onclick: () => this.addLayer()
            }, '+ Add')
          ]),

          // Layer list
          m('.space-y-2', [
            // Render layers in reverse order (top to bottom in UI)
            this.layers.slice().reverse().map(layer =>
              m('.bg-white.p-2.rounded.border', {
                key: layer.id,
                class: layer.id === this.activeLayerId ? 'border-blue-500.bg-blue-50' : 'border-gray-200'
              }, [
                m('.flex.justify-between.items-center', [
                  m('.flex.items-center.gap-2', [
                    m('button.text-sm', {
                      onclick: () => this.toggleLayerVisibility(layer.id)
                    }, layer.visible ? '👁️' : '👁️‍🗨️'),
                    m('span.text-sm.cursor-pointer', {
                      onclick: () => { this.activeLayerId = layer.id; }
                    }, layer.name)
                  ]),
                  m('button.text-red-500.text-sm', {
                    onclick: () => this.removeLayer(),
                    disabled: this.layers.length <= 1,
                    class: this.layers.length <= 1 ? 'opacity-50.cursor-not-allowed' : 'hover:bg-red-100'
                  }, '🗑️')
                ])
              ])
            )
          ]),

          // Layer info
          m('.mt-4.text-sm.text-gray-600', [
            m('p', `Active: Layer ${this.activeLayerId}`),
            m('p', `Total: ${this.layers.length} layers`)
          ])
        ])
      ]),

      // Instructions
      m('.mt-8.text-sm.text-gray-600.bg-gray-50.p-4.rounded', [
        m('h4.font-medium.mb-2', 'Instructions:'),
        m('ul.list-disc.list-inside.space-y-1', [
          m('li', 'Select pen or eraser tool from the toolbar'),
          m('li', 'Choose color and brush size'),
          m('li', 'Click and drag on the canvas to draw'),
          m('li', 'Use layers panel to add/remove/toggle layers'),
          m('li', 'Click on a layer name to make it active'),
          m('li', 'Eye icon toggles layer visibility'),
          m('li', 'Only the active layer receives drawing input')
        ])
      ])
    ]);
  }
};

// Export the component
export default HomePage;
