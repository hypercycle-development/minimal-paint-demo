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
    this.boundingBox = null;
    this._needsBBoxRescan = false;
    // hand the instance back to the parent
    vnode.attrs.onref && vnode.attrs.onref(this);
  },

  onremove(vnode) {
    vnode.attrs.onref && vnode.attrs.onref(null);
  },

  oncreate(vnode) {
    this.canvas = vnode.dom;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Set canvas size directly without DPI scaling
    const cssW = vnode.attrs.canvasWidth;
    const cssH = vnode.attrs.canvasHeight;
    this.canvas.width = cssW;
    this.canvas.height = cssH;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    // No DPI scaling applied

    // Calculate initial bounding box
    this.calculateBoundingBox();
  },

  calculateBoundingBox() {
    if (!this.ctx) return;

    const wpx = this.canvas.width;   // canvas pixels
    const hpx = this.canvas.height;  // canvas pixels
    const imageData = this.ctx.getImageData(0, 0, wpx, hpx);
    const data = imageData.data;

    let minX = wpx;
    let minY = hpx;
    let maxX = 0;
    let maxY = 0;
    let hasContent = false;

    for (let y = 0; y < hpx; y++) {
      for (let x = 0; x < wpx; x++) {
        const alpha = data[(y * wpx + x) * 4 + 3];
        if (alpha > 0) {
          hasContent = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (hasContent) {
      // No DPI conversion needed since canvas pixels = CSS pixels
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

  resetBBox() {
    this.boundingBox = null;
  },

  expandBBox(x1, y1, x2, y2, brush) {
    // All inputs are in canvas pixels (same as CSS pixels now)
    const pad = Math.ceil(brush / 2);
    const minX = Math.min(x1, x2) - pad;
    const minY = Math.min(y1, y2) - pad;
    const maxX = Math.max(x1, x2) + pad;
    const maxY = Math.max(y1, y2) + pad;

    const cssW = this.canvas.width;
    const cssH = this.canvas.height;

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const nMinX = clamp(minX, 0, cssW);
    const nMinY = clamp(minY, 0, cssH);
    const nMaxX = clamp(maxX, 0, cssW);
    const nMaxY = clamp(maxY, 0, cssH);

    if (!this.boundingBox) {
      this.boundingBox = {
        x: nMinX,
        y: nMinY,
        width: Math.max(0, nMaxX - nMinX),
        height: Math.max(0, nMaxY - nMinY)
      };
    } else {
      const bx = this.boundingBox;
      const newMinX = Math.min(bx.x, nMinX);
      const newMinY = Math.min(bx.y, nMinY);
      const newMaxX = Math.max(bx.x + bx.width, nMaxX);
      const newMaxY = Math.max(bx.y + bx.height, nMaxY);
      this.boundingBox = {
        x: newMinX,
        y: newMinY,
        width: Math.max(0, newMaxX - newMinX),
        height: Math.max(0, newMaxY - newMinY)
      };
    }
  },

  getMousePos(e, forMove = false) {
    if (forMove) {
      // For move tool, calculate position relative to the canvas container (not the moved canvas)
      const container = this.canvas.parentElement;
      const rect = container.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    } else {
      // For drawing tools, calculate position relative to the canvas itself
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  },

  startDrawing(e, attrs) {
    const { layer, tool, isActive } = attrs;
    if (!isActive || !layer.visible) return;

    const pos = this.getMousePos(e, tool === 'move');

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

    const pos = this.getMousePos(e, tool === 'move');

    if (tool === 'move' && this.isMoving) {
      const dx = pos.x - this.moveStartX;
      const dy = pos.y - this.moveStartY;

      // Update layer offset through parent component (incremental)
      onLayerMove && onLayerMove(layer.id, dx, dy);

      // Reset to make subsequent deltas incremental
      this.moveStartX = pos.x;
      this.moveStartY = pos.y;
    } else if (this.isDrawing && tool !== 'move') {
      this.ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      this.ctx.strokeStyle = tool === 'pen' ? color : '#000';
      this.ctx.lineWidth = brushSize;

      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();

      // Fast bbox update for pen; defer rescan for eraser
      if (tool === 'pen') this.expandBBox(this.lastX, this.lastY, pos.x, pos.y, brushSize);
      else this._needsBBoxRescan = true;

      this.lastX = pos.x;
      this.lastY = pos.y;
    }

    e.preventDefault();
  },

  stopDrawing(e) {
    this.isDrawing = false;
    this.isMoving = false;
    if (this._needsBBoxRescan) {
      this._needsBBoxRescan = false;
      (window.requestIdleCallback || window.setTimeout)(() => this.calculateBoundingBox(), 0);
    }
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
