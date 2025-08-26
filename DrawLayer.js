const DrawLayer = {
  oninit(vnode) {
    this.canvas = null;
    this.ctx = null;
    this.isDrawing = false;
    this.isMoving = false;
    this.lastX = 0;
    this.lastY = 0;
    this.moveStartX = 0;
    this.moveStartY = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.boundingBox = null;
  },

  oncreate(vnode) {
    this.canvas = vnode.dom;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Calculate initial bounding box
    this.calculateBoundingBox();
  },

  calculateBoundingBox() {
    if (!this.ctx) return;

    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;

    let minX = this.canvas.width;
    let minY = this.canvas.height;
    let maxX = 0;
    let maxY = 0;
    let hasContent = false;

    for (let y = 0; y < this.canvas.height; y++) {
      for (let x = 0; x < this.canvas.width; x++) {
        const alpha = data[(y * this.canvas.width + x) * 4 + 3];
        if (alpha > 0) {
          hasContent = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (hasContent) {
      this.boundingBox = {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      };
    } else {
      this.boundingBox = null;
    }
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

    const pos = this.getMousePos(e);

    if (tool === 'move') {
      this.isMoving = true;
      this.moveStartX = pos.x;
      this.moveStartY = pos.y;
    } else {
      this.isDrawing = true;
      this.lastX = pos.x;
      this.lastY = pos.y;
    }

    e.preventDefault();
  },

  draw(e, attrs) {
    const { layer, tool, brushSize, color, isActive, onLayerMove } = attrs;
    if (!isActive || !layer.visible) return;

    const pos = this.getMousePos(e);

    if (tool === 'move' && this.isMoving) {
      const deltaX = pos.x - this.moveStartX;
      const deltaY = pos.y - this.moveStartY;

      // Update layer offset through parent component
      onLayerMove && onLayerMove(layer.id, deltaX, deltaY);

    } else if (this.isDrawing && tool !== 'move') {
      this.ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      this.ctx.strokeStyle = tool === 'pen' ? color : 'rgba(0,0,0,1)';
      this.ctx.lineWidth = brushSize;

      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();

      this.lastX = pos.x;
      this.lastY = pos.y;

      // Recalculate bounding box after drawing
      this.calculateBoundingBox();
    }

    e.preventDefault();
  },

  stopDrawing(e) {
    this.isDrawing = false;
    this.isMoving = false;
    e && e.preventDefault();
  },

  clear(attrs) {
    if (this.ctx) {
      const { canvasWidth, canvasHeight } = attrs;
      this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      this.boundingBox = null;
    }
  },

  view(vnode) {
    const { layer, tool, canvasWidth, canvasHeight, zIndex, isActive } = vnode.attrs;

    const getCursor = () => {
      if (tool === 'move') return 'move';
      if (tool === 'pen') return 'crosshair';
      if (tool === 'eraser') return 'grab';
      return 'default';
    };

    return [
      // Main canvas
      m('canvas', {
        width: canvasWidth,
        height: canvasHeight,
        style: `
          position: absolute;
          top: ${layer.offsetY || 0}px;
          left: ${layer.offsetX || 0}px;
          z-index: ${zIndex};
          display: ${layer.visible ? 'block' : 'none'};
          cursor: ${getCursor()};
          pointer-events: ${isActive ? 'auto' : 'none'};
        `,
        onmousedown: (e) => this.startDrawing(e, vnode.attrs),
        onmousemove: (e) => this.draw(e, vnode.attrs),
        onmouseup: (e) => this.stopDrawing(e),
        onmouseleave: (e) => this.stopDrawing(e)
      }),

      // Bounding box overlay (only for active layer in move mode)
      (isActive && tool === 'move' && this.boundingBox && layer.visible) ?
        m('.absolute.border-2.border-dashed.border-blue-500.bg-blue-100.bg-opacity-20.pointer-events-none', {
          style: `
            left: ${(layer.offsetX || 0) + this.boundingBox.x}px;
            top: ${(layer.offsetY || 0) + this.boundingBox.y}px;
            width: ${this.boundingBox.width}px;
            height: ${this.boundingBox.height}px;
            z-index: ${zIndex + 1000};
          `
        }) : null
    ];
  }
};

export default DrawLayer;
