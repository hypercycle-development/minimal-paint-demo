// home.js
import DrawLayer from './DrawLayer.js';

const m = window.m;


const HomePage = {
  oninit(vnode) {
    this.layers = [
      {
        id: 1,
        name: 'Layer 1',
        visible: true,
        offsetX: 0,
        offsetY: 0,
        isGenerating: false,
        aiPrompt: '',
        aiNegativePrompt: '',
        isAiGenerated: false,
        useImg2Img: false,
        removeBg: false
      }
    ];
    this.activeLayerId = 1;
    this.nextLayerId = 2;
    this.layerRefs = new Map(); // Store references to DrawLayer components

    this.tool = 'pen'; // 'pen', 'eraser', or 'move'
    this.brushSize = 5;
    this.color = '#000000';

    this.canvasWidth = 800;
    this.canvasHeight = 600;

    // AI Generation
    this.showGenerateModal = false;
    this.generatePrompt = '';
    this.generateNegativePrompt = '';
    this.useImg2Img = false;
    this.removeBg = false;
    this.apiUrl = 'https://node1.hyperforge.ai/port/4000';

    // Drag and drop
    this.dragState = {
      isDragging: false,
      dragLayerId: null,
      dragStartY: 0,
      dragOverIndex: null
    };
  },

  getActiveLayer() {
    return this.layers.find(layer => layer.id === this.activeLayerId);
  },

  setActiveLayer(layerId) {
    this.activeLayerId = layerId;
    // Load the AI prompts from the newly selected layer
    const layer = this.layers.find(l => l.id === layerId);
    if (layer) {
      this.generatePrompt = layer.aiPrompt || '';
      this.generateNegativePrompt = layer.aiNegativePrompt || '';
      this.useImg2Img = layer.useImg2Img || false;
      this.removeBg = layer.removeBg || false;
    }
  },

  addLayer() {
    const newLayer = {
      id: this.nextLayerId++,
      name: `Layer ${this.nextLayerId - 1}`,
      visible: true,
      offsetX: 0,
      offsetY: 0,
      isGenerating: false,
      aiPrompt: '',
      aiNegativePrompt: '',
      isAiGenerated: false,
      useImg2Img: false,
      removeBg: false
    };
    this.layers.push(newLayer);
    this.setActiveLayer(newLayer.id);
  },

  removeLayer() {
    if (this.layers.length <= 1) return; // Keep at least one layer

    const index = this.layers.findIndex(layer => layer.id === this.activeLayerId);
    this.layers.splice(index, 1);

    // Remove reference
    this.layerRefs.delete(this.activeLayerId);

    // Set active layer to the previous one or first available
    let newActiveId;
    if (index > 0) {
      newActiveId = this.layers[index - 1].id;
    } else {
      newActiveId = this.layers[0].id;
    }
    this.setActiveLayer(newActiveId);
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
      activeLayerRef.clear({
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight
      });
    }
  },

  moveLayer(layerId, deltaX, deltaY) {
    const layer = this.layers.find(l => l.id === layerId);
    if (layer) {
      layer.offsetX = (layer.offsetX || 0) + deltaX;
      layer.offsetY = (layer.offsetY || 0) + deltaY;

      // Constrain to canvas bounds (optional)
      layer.offsetX = Math.max(-this.canvasWidth/2, Math.min(this.canvasWidth/2, layer.offsetX));
      layer.offsetY = Math.max(-this.canvasHeight/2, Math.min(this.canvasHeight/2, layer.offsetY));
    }
  },

  openGenerateModal() {
    this.showGenerateModal = true;
    this.generatePrompt = '';
    this.generateNegativePrompt = '';
  },

  closeGenerateModal() {
    this.showGenerateModal = false;
  },

  async generateImage() {
    if (!this.generatePrompt.trim()) return;

    const activeLayer = this.getActiveLayer();
    if (!activeLayer) return;

    // Mark layer as generating
    activeLayer.isGenerating = true;
    this.closeGenerateModal();
    m.redraw();

    try {
      const response = await fetch(`${this.apiUrl}/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: this.generatePrompt,
          negative_prompt: this.generateNegativePrompt,
          width: this.canvasWidth,
          height: this.canvasHeight,
          steps: 30,
          guidance_scale: 7.0,
          disable_safety: true,
          remove_bg: this.removeBg
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'ok') {
        // Load the generated image into the layer
        await this.loadImageToLayer(activeLayer.id, data.file);
      } else {
        console.error('Generation failed:', data.message);
        alert('Generation failed: ' + data.message);
      }
    } catch (error) {
      console.error('Generation error:', error);
      alert('Generation error: ' + error.message);
    } finally {
      activeLayer.isGenerating = false;
      m.redraw();
    }
  },

  async generateImageInline() {
    if (!this.generatePrompt.trim()) return;

    const activeLayer = this.getActiveLayer();
    if (!activeLayer) return;

    const layerRef = this.layerRefs.get(activeLayer.id);
    if (!layerRef) return;

    // Store the prompts and settings in the layer before generating
    activeLayer.aiPrompt = this.generatePrompt;
    activeLayer.aiNegativePrompt = this.generateNegativePrompt;
    activeLayer.useImg2Img = this.useImg2Img;
    activeLayer.removeBg = this.removeBg;

    // Determine generation parameters based on layer content and img2img setting
    let initImage = null;
    let width = this.canvasWidth;
    let height = this.canvasHeight;

    // Check if layer has content and img2img is enabled
    const hasContent = layerRef.boundingBox !== null;
    if (hasContent && this.useImg2Img) {
      // Use bounding box size for img2img
      width = layerRef.boundingBox.width;
      height = layerRef.boundingBox.height;

      // Extract the current layer content as base64
      const canvas = layerRef.canvas;
      const ctx = layerRef.ctx;

      // Create a temporary canvas with just the bounding box content
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');

      // Copy the bounding box area to temp canvas
      const imageData = ctx.getImageData(
        layerRef.boundingBox.x,
        layerRef.boundingBox.y,
        width,
        height
      );
      tempCtx.putImageData(imageData, 0, 0);

      // Convert to base64
      initImage = tempCanvas.toDataURL('image/png').split(',')[1];
    }

    // Mark layer as generating
    activeLayer.isGenerating = true;
    m.redraw();

    try {
      const requestBody = {
        prompt: this.generatePrompt,
        negative_prompt: this.generateNegativePrompt,
        width: width,
        height: height,
        steps: 30,
        guidance_scale: 7.0,
        disable_safety: true,
        remove_bg: this.removeBg
      };

      // Add img2img parameters if using existing content
      if (initImage) {
        requestBody.init_image = initImage;
        requestBody.strength = 0.7; // How much to change the original image
      }

      const response = await fetch(`${this.apiUrl}/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'ok') {
        if (initImage) {
          // For img2img, place the result at the bounding box location
          await this.loadImageToLayerAtPosition(
            activeLayer.id,
            data.file,
            layerRef.boundingBox.x,
            layerRef.boundingBox.y,
            width,
            height
          );
        } else {
          // For txt2img, replace entire layer
          await this.loadImageToLayer(activeLayer.id, data.file);
        }

        // Mark as AI generated
        activeLayer.isAiGenerated = true;
      } else {
        console.error('Generation failed:', data.message);
        alert('Generation failed: ' + data.message);
      }
    } catch (error) {
      console.error('Generation error:', error);
      alert('Generation error: ' + error.message);
    } finally {
      activeLayer.isGenerating = false;
      m.redraw();
    }
  },

  async loadImageToLayer(layerId, base64Data) {
    return new Promise((resolve, reject) => {
      const layer = this.layers.find(l => l.id === layerId);
      const layerRef = this.layerRefs.get(layerId);

      if (!layer || !layerRef) {
        reject(new Error('Layer not found'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        // Clear the layer first
        layerRef.clear({
          canvasWidth: this.canvasWidth,
          canvasHeight: this.canvasHeight
        });

        // Draw the generated image
        layerRef.ctx.drawImage(img, 0, 0, this.canvasWidth, this.canvasHeight);

        // Recalculate bounding box
        layerRef.calculateBoundingBox();

        m.redraw();
        resolve();
      };

      img.onerror = (error) => {
        reject(error);
      };

      img.src = `data:image/png;base64,${base64Data}`;
    });
  },

  async loadImageToLayerAtPosition(layerId, base64Data, x, y, width, height) {
    return new Promise((resolve, reject) => {
      const layer = this.layers.find(l => l.id === layerId);
      const layerRef = this.layerRefs.get(layerId);

      if (!layer || !layerRef) {
        reject(new Error('Layer not found'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        // Clear only the specific area where we'll place the new image
        layerRef.ctx.clearRect(x, y, width, height);

        // Draw the generated image at the specific position and size
        layerRef.ctx.drawImage(img, x, y, width, height);

        // Recalculate bounding box
        layerRef.calculateBoundingBox();

        m.redraw();
        resolve();
      };

      img.onerror = (error) => {
        reject(error);
      };

      img.src = `data:image/png;base64,${base64Data}`;
    });
  },

  layerHasContent(layerId) {
    const layerRef = this.layerRefs.get(layerId);
    return layerRef && layerRef.boundingBox !== null;
  },

  // Drag and drop methods
  startDrag(e, layerId) {
    this.dragState.isDragging = true;
    this.dragState.dragLayerId = layerId;
    this.dragState.dragStartY = e.clientY;
    this.dragState.dragOverIndex = null;

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', layerId.toString());

    // Add a slight delay before showing drag feedback
    setTimeout(() => {
      if (this.dragState.isDragging) {
        m.redraw();
      }
    }, 50);
  },

  dragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (this.dragState.isDragging) {
      this.dragState.dragOverIndex = index;
      m.redraw();
    }
  },

  dragLeave(e) {
    // Only clear dragOverIndex if we're actually leaving the drop zone
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      this.dragState.dragOverIndex = null;
      m.redraw();
    }
  },

  drop(e, targetIndex) {
    e.preventDefault();

    if (!this.dragState.isDragging || this.dragState.dragLayerId === null) return;

    const dragLayerId = this.dragState.dragLayerId;
    const dragLayerIndex = this.layers.findIndex(l => l.id === dragLayerId);

    if (dragLayerIndex === -1) return;

    // Remove the dragged layer from its current position
    const [draggedLayer] = this.layers.splice(dragLayerIndex, 1);

    // Insert it at the new position
    this.layers.splice(targetIndex, 0, draggedLayer);

    this.endDrag();
  },

  endDrag() {
    this.dragState.isDragging = false;
    this.dragState.dragLayerId = null;
    this.dragState.dragOverIndex = null;
    m.redraw();
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
          }, 'Eraser'),
          m('button.px-3.py-1.rounded.text-sm', {
            class: this.tool === 'move' ? 'bg-blue-500.text-white' : 'bg-white.border',
            onclick: () => { this.tool = 'move'; }
          }, 'Move')
        ]),

        // Color picker (only for pen)
        this.tool === 'pen' ? m('.flex.gap-2.items-center', [
          m('label.text-sm.font-medium', 'Color:'),
          m('input[type=color]', {
            value: this.color,
            onchange: (e) => { this.color = e.target.value; }
          })
        ]) : null,

        // Brush size (not for move tool)
        this.tool !== 'move' ? m('.flex.gap-2.items-center', [
          m('label.text-sm.font-medium', 'Size:'),
          m('input[type=range]', {
            min: 1,
            max: 50,
            value: this.brushSize,
            onchange: (e) => { this.brushSize = parseInt(e.target.value); }
          }),
          m('span.text-sm.w-8', this.brushSize + 'px')
        ]) : null,

        // Clear button
        m('button.px-3.py-1.bg-red-500.text-white.rounded.text-sm', {
          onclick: () => this.clearActiveLayer()
        }, 'Clear Layer'),

        // Generate AI button
        m('button.px-3.py-1.bg-purple-500.text-white.rounded.text-sm', {
          onclick: () => this.openGenerateModal(),
          disabled: this.getActiveLayer()?.isGenerating
        }, this.getActiveLayer()?.isGenerating ? 'Generating...' : 'AI Generate')
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
                onLayerMove: (layerId, deltaX, deltaY) => this.moveLayer(layerId, deltaX, deltaY),
                onref: (inst) => {
                  if (inst) this.layerRefs.set(layer.id, inst);
                  else this.layerRefs.delete(layer.id);
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
          m('.space-y-2.mb-4', [
            // Render layers in reverse order (top to bottom in UI)
            this.layers.slice().reverse().map((layer, reverseIndex) => {
              const actualIndex = this.layers.length - 1 - reverseIndex;
              const isDragging = this.dragState.dragLayerId === layer.id;
              const isDropTarget = this.dragState.dragOverIndex === actualIndex;

              return m('.relative', {
                key: layer.id
              }, [
                // Drop indicator line (above)
                isDropTarget && this.dragState.isDragging ?
                  m('.absolute.-top-1.left-0.right-0.h-0.5.bg-blue-500.z-10') : null,

                // Layer item
                m('.bg-white.p-2.rounded.border.transition-all.duration-150', {
                  draggable: true,
                  class: [
                    layer.id === this.activeLayerId ?
                      'border-blue-500 bg-blue-50 shadow-md ring-4 ring-blue-500 ring-offset-2 ring-offset-white'
                      : 'border-gray-200.hover:border-gray-300',
                    isDragging ? 'opacity-50.scale-95.rotate-1' : '',
                    isDropTarget ? 'border-blue-400.bg-blue-50' : ''
                  ].filter(Boolean).join(' '),
                  ondragstart: (e) => this.startDrag(e, layer.id),
                  ondragover: (e) => this.dragOver(e, actualIndex),
                  ondragleave: (e) => this.dragLeave(e),
                  ondrop: (e) => this.drop(e, actualIndex),
                  ondragend: () => this.endDrag()
                }, [
                  m('.flex.justify-between.items-center', [
                    m('.flex.items-center.gap-2', [
                      // Drag handle
                      m('.cursor-move.text-gray-400.hover:text-gray-600.px-1', {
                        title: 'Drag to reorder'
                      }, '⋮⋮'),

                      m('button.text-sm', {
                        onclick: () => this.toggleLayerVisibility(layer.id)
                      }, layer.visible ? '👁️' : '👁️‍🗨️'),

                      m('span.text-sm.cursor-pointer.font-medium.flex-1', {
                        onclick: () => this.setActiveLayer(layer.id),
                        class: layer.isGenerating ? 'text-purple-600 animate-pulse' :
                               (layer.id === this.activeLayerId ? 'text-blue-800' : 'text-gray-700')
                      }, [
                        layer.isGenerating ? `${layer.name} (generating...)` : layer.name,
                        layer.isAiGenerated ? m('span.ml-1.text-xs.px-1.bg-purple-100.text-purple-700.rounded', '🤖') : null
                      ])
                    ]),
                    m('button.text-red-500.text-sm', {
                      onclick: () => this.removeLayer(),
                      disabled: this.layers.length <= 1,
                      class: this.layers.length <= 1 ? 'opacity-50.cursor-not-allowed' : 'hover:bg-red-100.rounded'
                    }, '🗑️')
                  ])
                ]),

                // Drop indicator line (below for last item)
                (reverseIndex === this.layers.length - 1 && isDropTarget && this.dragState.isDragging) ?
                  m('.absolute.-bottom-1.left-0.right-0.h-0.5.bg-blue-500.z-10') : null
              ]);
            })
          ]),

          // AI Generation Controls for Active Layer
          m('.border-t.pt-4', [
            m('h4.text-sm.font-medium.mb-3.text-gray-700', [
              'AI Generate (Active Layer)',
              this.getActiveLayer()?.isAiGenerated ?
                m('span.ml-2.text-xs.px-2.py-1.bg-purple-100.text-purple-700.rounded', '🤖 AI Layer') : null
            ]),

            m('.space-y-2', [
              // Prompt input
              m('textarea.w-full.p-2.text-xs.border.rounded.resize-none', {
                rows: 2,
                placeholder: this.getActiveLayer()?.isAiGenerated ?
                  'Edit prompt to regenerate...' : 'Enter prompt...',
                value: this.generatePrompt,
                oninput: (e) => {
                  this.generatePrompt = e.target.value;
                  // Update the current layer's stored prompt as user types
                  const activeLayer = this.getActiveLayer();
                  if (activeLayer) {
                    activeLayer.aiPrompt = e.target.value;
                  }
                }
              }),

              // Negative prompt input
              m('textarea.w-full.p-2.text-xs.border.rounded.resize-none', {
                rows: 2,
                placeholder: this.getActiveLayer()?.isAiGenerated ?
                  'Edit negative prompt...' : 'Negative prompt (optional)...',
                value: this.generateNegativePrompt,
                oninput: (e) => {
                  this.generateNegativePrompt = e.target.value;
                  // Update the current layer's stored negative prompt as user types
                  const activeLayer = this.getActiveLayer();
                  if (activeLayer) {
                    activeLayer.aiNegativePrompt = e.target.value;
                  }
                }
              }),

              // Img2img checkbox (only show if layer has content)
              this.layerHasContent(this.activeLayerId) ? m('.flex.items-center.gap-2.p-2.bg-gray-50.rounded', [
                m('input[type=checkbox]', {
                  id: 'img2img-checkbox',
                  checked: this.useImg2Img,
                  onchange: (e) => {
                    this.useImg2Img = e.target.checked;
                    // Update the current layer's img2img preference
                    const activeLayer = this.getActiveLayer();
                    if (activeLayer) {
                      activeLayer.useImg2Img = e.target.checked;
                    }
                  }
                }),
                m('label.text-xs.text-gray-700.cursor-pointer', {
                  for: 'img2img-checkbox'
                }, [
                  'Use existing content (img2img)',
                  m('div.text-xs.text-gray-500.mt-1',
                    this.useImg2Img ? 'Will modify existing content' : 'Will replace entire layer')
                ])
              ]) : null,

              // Background removal checkbox
              m('.flex.items-center.gap-2.p-2.bg-gray-50.rounded', [
                m('input[type=checkbox]', {
                  id: 'remove-bg-checkbox',
                  checked: this.removeBg,
                  onchange: (e) => {
                    this.removeBg = e.target.checked;
                    // Update the current layer's background removal preference
                    const activeLayer = this.getActiveLayer();
                    if (activeLayer) {
                      activeLayer.removeBg = e.target.checked;
                    }
                  }
                }),
                m('label.text-xs.text-gray-700.cursor-pointer', {
                  for: 'remove-bg-checkbox'
                }, [
                  'Remove background',
                  m('div.text-xs.text-gray-500.mt-1',
                    this.removeBg ? 'Generated image will have transparent background' : 'Generated image will have background')
                ])
              ]),

              // Generate/Regenerate button
              m('button.w-full.px-3.py-2.bg-purple-500.text-white.rounded.text-sm.font-medium', {
                onclick: () => this.generateImageInline(),
                disabled: !this.generatePrompt.trim() || this.getActiveLayer()?.isGenerating,
                class: (!this.generatePrompt.trim() || this.getActiveLayer()?.isGenerating) ?
                  'opacity-50.cursor-not-allowed' : 'hover:bg-purple-600'
              }, this.getActiveLayer()?.isGenerating ? 'Generating...' :
                 (this.getActiveLayer()?.isAiGenerated ? 'Regenerate Image' : 'Generate Image')),

              // Size info - show different info based on img2img mode
              m('.text-xs.text-gray-500.text-center', (() => {
                const hasContent = this.layerHasContent(this.activeLayerId);
                const layerRef = this.layerRefs.get(this.activeLayerId);

                if (hasContent && this.useImg2Img && layerRef && layerRef.boundingBox) {
                  return `${layerRef.boundingBox.width} × ${layerRef.boundingBox.height}px (content area)`;
                } else {
                  return `${this.canvasWidth} × ${this.canvasHeight}px (full layer)`;
                }
              })())
            ])
          ]),

          // Layer info
          m('.mt-4.text-sm.text-gray-600', [
            m('p', `Active: Layer ${this.activeLayerId}`),
            m('p', `Total: ${this.layers.length} layers`),
            this.tool === 'move' ? m('p.text-blue-600.font-medium', 'Move mode: Drag to reposition active layer') : null
          ])
        ])
      ]),

      // Instructions
      m('.mt-8.text-sm.text-gray-600.bg-gray-50.p-4.rounded', [
        m('h4.font-medium.mb-2', 'Instructions:'),
        m('ul.list-disc.list-inside.space-y-1', [
          m('li', 'Select pen, eraser, or move tool from the toolbar'),
          m('li', 'Choose color and brush size (pen/eraser only)'),
          m('li', 'Click and drag on the canvas to draw or move'),
          m('li', 'Move tool: highlights bounding box and repositions the active layer'),
          m('li', 'AI Generate: create content using AI prompts'),
          m('li', 'Remove background: generates images with transparent backgrounds'),
          m('li', 'Drag the ⋮⋮ handle to reorder layers'),
          m('li', 'Use layers panel to add/remove/toggle layers'),
          m('li', 'Click on a layer name to make it active'),
          m('li', 'Eye icon toggles layer visibility'),
          m('li', 'Only the active layer receives drawing/moving input')
        ])
      ]),

      // Generate Modal
      this.showGenerateModal ? m('.fixed.inset-0.bg-black.bg-opacity-50.flex.items-center.justify-center.z-50', {
        onclick: (e) => {
          if (e.target === e.currentTarget) this.closeGenerateModal();
        }
      }, [
        m('.bg-white.rounded-lg.p-6.max-w-md.w-full.mx-4', [
          m('h3.text-lg.font-bold.mb-4', 'Generate AI Image'),

          m('.space-y-4', [
            m('.space-y-2', [
              m('label.block.text-sm.font-medium', 'Prompt (required)'),
              m('textarea.w-full.p-2.border.rounded.resize-none', {
                rows: 3,
                placeholder: 'Describe what you want to generate...',
                value: this.generatePrompt,
                oninput: (e) => { this.generatePrompt = e.target.value; }
              })
            ]),

            m('.space-y-2', [
              m('label.block.text-sm.font-medium', 'Negative Prompt (optional)'),
              m('textarea.w-full.p-2.border.rounded.resize-none', {
                rows: 2,
                placeholder: 'What you don\'t want in the image...',
                value: this.generateNegativePrompt,
                oninput: (e) => { this.generateNegativePrompt = e.target.value; }
              })
            ]),

            // Background removal checkbox in modal
            m('.flex.items-center.gap-2', [
              m('input[type=checkbox]', {
                id: 'modal-remove-bg-checkbox',
                checked: this.removeBg,
                onchange: (e) => { this.removeBg = e.target.checked; }
              }),
              m('label.text-sm.text-gray-700.cursor-pointer', {
                for: 'modal-remove-bg-checkbox'
              }, 'Remove background (transparent)')
            ]),

            m('.text-sm.text-gray-600', [
              m('p', `Image size: ${this.canvasWidth} × ${this.canvasHeight}px`),
              m('p', 'This will replace any existing content on the active layer.')
            ])
          ]),

          m('.flex.justify-end.gap-2.mt-6', [
            m('button.px-4.py-2.border.rounded.text-gray-600', {
              onclick: () => this.closeGenerateModal()
            }, 'Cancel'),
            m('button.px-4.py-2.bg-purple-500.text-white.rounded', {
              onclick: () => this.generateImage(),
              disabled: !this.generatePrompt.trim(),
              class: !this.generatePrompt.trim() ? 'opacity-50.cursor-not-allowed' : 'hover:bg-purple-600'
            }, 'Generate')
          ])
        ])
      ]) : null
    ]);
  }
};

// Export the component
export default HomePage;
