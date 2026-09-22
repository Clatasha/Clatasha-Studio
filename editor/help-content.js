export const CLATASHA_TOOL_GUIDE = [
  {
    title: 'Select and Navigate',
    tools: [
      { selector: '[data-tool="select"]', name: 'Select', shortcut: 'V', description: 'Select, move, resize and rotate objects on the canvas.' },
      { selector: '[data-tool="hand"]', name: 'Pan', shortcut: 'H', description: 'Move around the workspace without moving canvas objects.' },
      { selector: '#zoomToolBtn', name: 'Zoom', shortcut: 'Z', description: 'Click to zoom in, Alt-click to zoom out, or drag around an area to fit it in the workspace.' },
    ],
  },
  {
    title: 'Create',
    tools: [
      { selector: '[data-tool="text"]', name: 'Text', shortcut: 'T', description: 'Add editable horizontal text. Right-click the icon to choose Vertical Text.' },
      { selector: '[data-text-tool="vertical-text"]', name: 'Vertical Text', shortcut: '', description: 'Create an editable top-to-bottom text column while keeping normal typography and style controls.' },
      { selector: '#shapeMainTool', name: 'Shapes', shortcut: 'R', description: 'Draw rectangles. Right-click for ellipse, triangle, polygon, line, arrow and speech bubble tools.' },
      { selector: '#stickerBtn', name: 'Stickers', shortcut: 'S', description: 'Open the sticker library, including editable vector asset packs.' },
      { selector: '#brushStudioBtn', name: 'Brush Studio', shortcut: 'D', description: 'Paint with adjustable brushes, colors, opacity, softness and presets.' },
    ],
  },
  {
    title: 'Import and Edit Images',
    tools: [
      { selector: '[data-tool="image"]', name: 'Import Image', shortcut: 'I', description: 'Choose an image or SVG and add it as the top canvas layer.' },
      { selector: '#videoFrameBtn', name: 'Video Frame', shortcut: '', description: 'Choose a local video, find a useful frame and add it to the canvas.' },
      { selector: '#cropBtn', name: 'Crop and Masks', shortcut: 'C', description: 'Crop an image or apply rectangular, rounded and circular masks. Right-click for Perspective and Slice.' },
      { selector: '#perspectiveCropBtn', name: 'Perspective', shortcut: 'P', description: 'Choose it from the Crop flyout, position four corners around a surface and straighten its perspective.' },
      { selector: '#sliceToolBtn', name: 'Slice', shortcut: '', description: 'Draw a cut line across an image to turn it into two independently movable image layers.' },
      { selector: '[data-tool="bgremove"]', name: 'Color Remover', shortcut: 'G', description: 'Click a color in an image and remove similar pixels using tolerance control.' },
      { selector: '[data-tool="cutout"]', name: 'Cutout Brush', shortcut: 'X', description: 'Brush away image areas. Hold Alt while brushing to restore removed pixels.' },
      { selector: '[data-tool="healing"]', name: 'Spot Healing', shortcut: 'J', description: 'Brush over small unwanted marks and blend them with nearby image detail.' },
      { selector: '[data-tool="eraser"]', name: 'Eraser', shortcut: '', description: 'Erase painted content from compatible canvas layers.' },
      { selector: '[data-tool="bucket"]', name: 'Paint Bucket', shortcut: 'K', description: 'Fill connected areas with the selected color.' },
      { selector: '[data-tool="eyedropper"]', name: 'Eyedropper', shortcut: 'Y', description: 'Sample a canvas color. Shift-click samples it for stroke or outline use.' },
    ],
  },
];

export const CLATASHA_FEATURE_GUIDE = [
  {
    title: 'Canvas, Rulers and Guides',
    description: 'Use the zoom controls in the top bar to inspect or fit the design. Drag from a ruler to create a movable guide. View controls can show or hide rulers, guides and snapping without affecting the exported image.',
  },
  {
    title: 'Layers and Groups',
    description: 'The Layers tab controls blend mode, opacity, order, visibility and locking. Click the opacity field or its arrow to open the live slider. The fixed appearance row works with one or several selected layers. Ctrl-click selects separate layers and Shift-click selects a range. Click a child layer inside an expanded group to edit it without ungrouping, or double-click grouped text on the canvas. Press Escape to return to the parent group.',
  },
  {
    title: 'Properties and Adjustments',
    description: 'Properties changes with the selected text, image, shape or group. Adjustments includes eight visual image presets with live canvas previews, plus collapsible custom controls for brightness, contrast, saturation, hue, blur, noise and pixelation.',
  },
  {
    title: 'Text Styles and Fonts',
    description: 'Select a text layer and click a Text Style to apply it immediately. Typography controls support custom fonts, spacing, alignment, wrapping, outlines, shadows, gradients and curved text.',
  },
  {
    title: 'Clipping Masks and Blend Modes',
    description: 'Use a clipping mask to confine one layer to the shape beneath it. Blend modes combine the selected layer with layers below it for lighting, color and compositing effects.',
  },
  {
    title: 'Projects and Export',
    description: 'Save working projects locally or export an editable .clatasha project file. Save the current canvas as a reusable template with a generated preview; saved templates can be updated, renamed, duplicated, exported or deleted. Finished designs can be exported as PNG, JPG or WebP, with quality controls and supported transparent-background options.',
  },
  {
    title: 'Clatasha Click Check',
    description: 'Preview a thumbnail at realistic sizes, test light and dark surroundings, inspect editable text, image resolution, scaling, placement, transparency and tonal range, then compare up to three captured variations.',
  },
  {
    title: 'Plugins',
    description: 'Open Image Merger, Image Cipher and Image to SVG from the Plugins menu. Image to SVG traces raster artwork into scalable paths with a preview, SVG download and Add to Canvas. You can also install local .clatasha-plugin tools, review their requested access, and enable or disable them in Manage Plugins.',
  },
];

export const CLATASHA_SHORTCUTS = [
  ['V', 'Select'],
  ['H', 'Pan'],
  ['Z', 'Zoom tool'],
  ['T', 'Text'],
  ['R', 'Rectangle and shape menu'],
  ['S', 'Stickers'],
  ['I', 'Import image'],
  ['D', 'Brush Studio'],
  ['X', 'Cutout Brush'],
  ['J', 'Spot Healing'],
  ['C', 'Crop'],
  ['P', 'Perspective correction'],
  ['G', 'Color background remover'],
  ['K', 'Paint Bucket'],
  ['Y', 'Eyedropper'],
  ['Arrow keys', 'Move selected layer by 1 pixel'],
  ['Shift + Arrow', 'Move selected layer by 10 pixels'],
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Shift + Z', 'Redo'],
  ['Ctrl + D', 'Duplicate'],
  ['Ctrl + G', 'Group selected layers'],
  ['Ctrl + Shift + G', 'Ungroup'],
  ['Ctrl + Alt + G', 'Toggle clipping mask'],
  ['Delete', 'Delete selected layer'],
];

export const CLATASHA_CHANGELOG = [
  {
    version: '1.0.62',
    label: 'Reliable Editor Menus',
    changes: [
      'Made the top menus responsive immediately when the editor opens.',
      'Separated menu opening from the larger editor startup process.',
      'Restored recent saved projects in the extension popup after the template database upgrade.',
      'Added safer startup error reporting and refreshed script versioning.',
    ],
  },
  {
    version: '1.0.61',
    label: 'My Templates and Shorts Layouts',
    changes: [
      'Added editable user templates saved locally with lightweight previews generated from the real canvas.',
      'Organized templates into YouTube, Shorts and custom-size sections with a compact three-column grid.',
      'Added All, My Templates, YouTube and Shorts filters plus Save as Template controls.',
      'Added three starter 1080 × 1920 Shorts templates.',
      'Added template updating, renaming, duplication, export and complete deletion of saved data and its preview.',
    ],
  },
  {
    version: '1.0.60',
    label: 'Offline High-Accuracy SVG Tracing',
    changes: [
      'Added a compact, locally bundled VTracer vector engine for finer photographic color separation.',
      'Automatically selected region tracing for flat artwork and translucent fills, preserving corners, alpha and fine gradient detail.',
      'Moved conversions into cancellable background workers and released their memory after completion.',
      'Added Logo, Illustration and Photo presets plus Compact, Balanced and High Accuracy options.',
      'Added 128- and 256-color settings and tracing detail up to 2048 pixels while preserving original SVG output dimensions.',
      'Added synchronized Fit, 100%, 200% and 400% previews with drag panning for close comparisons.',
      'Kept all processing offline with no API calls, model downloads or external image uploads.',
    ],
  },
  {
    version: '1.0.59',
    label: 'Smoother SVG Tracing',
    changes: [
      'Improved Image to SVG with curved outlines and sharp-corner preservation instead of pixel-step polygons.',
      'Raised default tracing to 32 colors and 1024-pixel detail, with up to 64 colors and 1536-pixel detail.',
      'Cleaned anti-aliased transparent edges before curve fitting while retaining uniform translucent fills.',
      'Merged small color regions into neighboring fills and reduced seams between opaque colors without filling transparent holes.',
      'Kept zero-smoothing mode available for exact pixel-art tracing.',
    ],
  },
  {
    version: '1.0.58',
    label: 'Image to SVG Plugin',
    changes: [
      'Added Image to SVG to the Plugins menu with offline tracing into actual vector paths.',
      'Added color and black-and-white tracing, color count, detail, smoothing and small-detail controls.',
      'Added original and vector previews, border-connected white-background removal and transparent-area support.',
      'Added SVG download and insertion as a new canvas image layer without replacing the source.',
      'Added cancellable conversion and automatic invalidation when tracing settings change.',
    ],
  },
  {
    version: '1.0.57',
    label: 'Reliable Canvas Drag and Drop',
    changes: [
      'Fixed the drop overlay intercepting its own canvas drop target and causing a blinking highlight.',
      'Kept file drops stable across canvas surfaces, rulers and off-canvas transform handles.',
      'Prevented dropped files and image links from opening in Chrome when released outside the workspace.',
      'Cleared the drop highlight after drops, cancelled drags and leaving the editor.',
    ],
  },
  {
    version: '1.0.56',
    label: 'Clatasha Image Cipher',
    changes: [
      'Added Image Cipher as the second bundled Clatasha Studio plugin.',
      'Added password-based AES-256-GCM encryption before messages are concealed inside image pixels.',
      'Added lossless PNG export, message-capacity feedback, and an automatic output integrity check.',
      'Added message recovery with password authentication and one-click copying.',
      'Added an installable Image Cipher .clatasha-plugin package as a complete Plugin API example.',
    ],
  },
  {
    version: '1.0.55',
    label: 'Adjustment Presets',
    changes: [
      'Added eight image adjustment presets in a compact two-row preview grid.',
      'Added live full-image previews on hover and one-step preset application with Undo support.',
      'Separated Adjustment Presets and Custom Adjustments into collapsible sections.',
      'Added a tiny low-resolution tribute photograph as the permanent preset preview artwork.',
      'Kept preset color treatments intact while custom sliders are fine-tuned.',
    ],
  },
  {
    version: '1.0.54',
    label: 'Quick Image Fitting and Rotation',
    changes: [
      'Added Fit to Canvas to the image right-click menu.',
      'Added a compact Rotate submenu with left and right 90-degree commands.',
      'Made Fit to Canvas preserve natural image proportions while keeping filters, masks, opacity, and layer order intact.',
      'Made each image transform a single undoable action.',
    ],
  },
  {
    version: '1.0.53',
    label: 'Off-Canvas Transform Controls',
    changes: [
      'Added interactive resize and rotation handles in the workspace outside the document canvas.',
      'Made transform anchors easier to see with a white center, dark outline, and Clatasha accent point.',
      'Kept anchor sizes readable at every zoom level.',
      'Added automatic workspace panning while an outer transform handle is dragged near an editor edge.',
      'Kept the document size, exported artwork, rulers, guides, and contained text editing unchanged.',
    ],
  },
  {
    version: '1.0.52',
    label: 'Expanded Creation Tools',
    changes: [
      'Added Horizontal and Vertical Text choices to the Text tool flyout.',
      'Added a toolbar Zoom tool with point zooming, Alt-click zoom out, and drag-to-area zoom.',
      'Moved Perspective Correction into the Crop flyout and added the new image Slice tool.',
      'Added magnetic horizontal, vertical, and 45-degree Slice angles, with Shift for 15-degree snapping.',
      'Added Triangle and editable regular Polygon shapes with three to twelve sides.',
      'Applied the supplied replacement SVG artwork to the Default toolbar.',
    ],
  },
  {
    version: '1.0.51',
    label: 'Layer Title Dragging',
    changes: [
      'Expanded layer reordering from the grip to the layer icon and title area.',
      'Kept normal title clicks for selection and double-clicks for inline renaming.',
      'Prevented visibility, lock, group, and clipping controls from starting a drag.',
      'Kept nested group children and clipped layers protected from accidental root reordering.',
    ],
  },
  {
    version: '1.0.50',
    label: 'Live Opacity Slider',
    changes: [
      'Added a Photoshop-style popover slider to the Layers opacity field.',
      'Opacity now updates on the canvas continuously while the slider is dragged.',
      'Kept direct percentage entry and synchronized it with the live slider.',
      'Kept the slider floating over the layer list so opening it does not resize the Layers tab.',
    ],
  },
  {
    version: '1.0.49',
    label: 'Layer Appearance Controls',
    changes: [
      'Added Blend and Opacity controls side by side at the top of the Layers tab.',
      'Kept the appearance row fixed while the layer list scrolls independently beneath it.',
      'Added support for individual layers, groups, and multi-layer selections with mixed-value feedback.',
      'Kept the Layers and Properties appearance values synchronized without switching tabs.',
    ],
  },
  {
    version: '1.0.48',
    label: 'Installable Plugin Packages',
    changes: [
      'Added installation for local .clatasha-plugin packages from the Plugins menu and manager.',
      'Added package validation, integrity checks, size limits, path protection, and a permission review before installation.',
      'Added persistent local plugin storage with enable, disable, update, remove, and reinstall support.',
      'Added a restricted offline sandbox for third-party tools using the permission-controlled Plugin API v1.',
      'Added an installable Starter Card example package for plugin developers and testing.',
    ],
  },
  {
    version: '1.0.47',
    label: 'Stable Image Merger Layout',
    changes: [
      'Locked the Image Merger source row to a stable height when images are loaded.',
      'Removed uploaded image dimensions from layout sizing so the preview and controls no longer get pushed or squished.',
      'Kept the preview workspace and action bar independently contained at every image aspect ratio.',
    ],
  },
  {
    version: '1.0.46',
    label: 'Clatasha Plugin Framework',
    changes: [
      'Added the Plugins menu with management, install, enable, disable, remove, and quick-launch controls.',
      'Added Plugin API v1 with declared permissions, isolated tool interfaces, local settings, canvas access, and lifecycle cleanup.',
      'Added the Image Merger as the first bundled plugin with a premium interface, draggable positioning, split and divider controls, PNG download, and Add to Canvas.',
      'Added in-editor developer documentation and a packaged Plugin API reference for future plugin creators.',
    ],
  },
  {
    version: '1.0.45',
    label: 'Clean Snap Release',
    changes: [
      'Removed live snap corrections that could create flickering or a shadow-like second position while dragging.',
      'Snapping now previews its guide during movement and applies one alignment correction when the layer is released.',
      'Changed snapping to disabled by default and migrated older saved preferences to the new default.',
      'Kept parent-group exclusions and coordinate-safe snapping for grouped layers.',
    ],
  },
  {
    version: '1.0.44',
    label: 'Smooth Layer Snapping',
    changes: [
      'Changed snapping to follow the raw pointer position instead of correcting a previously snapped position.',
      'Added a stable snap lock that releases cleanly after the pointer leaves its guide.',
      'Stopped child layers from snapping against their own parent group.',
      'Added proper coordinate conversion when snapping layers inside scaled or rotated groups.',
    ],
  },
  {
    version: '1.0.43',
    label: 'Edit Inside Groups',
    changes: [
      'Added controlled child-layer editing without ungrouping layers.',
      'Double-click grouped text on the canvas to edit its wording and typography.',
      'Click a child in the Layers panel to select and edit that individual layer.',
      'Press Escape to return to the parent group while regular clicks continue selecting the complete group.',
    ],
  },
  {
    version: '1.0.42',
    label: 'Refined 3D Text Depth',
    changes: [
      'Adjusted the eight 3D and extrusion text preset shadow offsets.',
      'Reduced oversized depth offsets while preserving each preset’s colors and typography.',
    ],
  },
  {
    version: '1.0.41',
    label: 'Text Styles Preserve Typography',
    changes: [
      'Text Styles now apply visual effects without replacing the selected font or size.',
      'Existing text keeps its font family, size, weight, spacing, and wording.',
      'Clicking a style with no text selected no longer creates an unexpected text layer.',
    ],
  },
  {
    version: '1.0.40',
    label: 'Contained Text Editing',
    changes: [
      'Isolated the canvas viewport from flex sizing while text is being edited.',
      'Moved Fabric\u2019s hidden text input into a fixed 1\u00D71 containment host.',
      'Prevented text layers near the canvas edge from expanding the outer workspace during typing.',
    ],
  },
  {
    version: '1.0.39',
    label: 'Stable Text Editing Layout',
    changes: [
      'Stopped text editing from changing the canvas container dimensions.',
      'Prevented the flex workspace from expanding when text is placed near a canvas edge.',
      'Kept Fabric’s hidden editing textarea constrained without resizing the visible canvas.',
    ],
  },
  {
    version: '1.0.38',
    label: 'Cursor Asset Path Fix',
    changes: [
      'Fixed custom cursor files not loading from the editor page.',
      'Tool-specific cursor artwork now resolves from the extension assets folder.',
    ],
  },
  {
    version: '1.0.37',
    label: 'Tool-specific Mouse Cursors',
    changes: [
      'Added recognizable cursors for shapes, crop, eyedropper, paint bucket, background removal and erasing.',
      'Kept Brush Studio, Cutout Brush and Spot Healing cursors scalable with their brush sizes.',
      'Unified Fabric.js and canvas-area cursor behavior, including hand-tool grabbing while panning.',
    ],
  },
  {
    version: '1.0.36',
    label: 'Click Check Image Diagnostics',
    changes: [
      'Added conservative offline image checks for source resolution, enlargement and uneven scaling.',
      'Added warnings for off-canvas image layers and images containing almost no visible pixels.',
      'Added rendered-canvas checks for nearly blank, extremely dark, extremely bright and low-separation designs.',
      'Added Text, Image, Canvas and Layers labels to make every warning easier to understand.',
    ],
  },
  {
    version: '1.0.35',
    label: 'Help Center',
    changes: [
      'Added the Help menu with Guide, Updates and About pages.',
      'Added an illustrated toolbar reference and keyboard shortcut list.',
      'Added Clatasha company branding and copyright information.',
    ],
  },
  {
    version: '1.0.34',
    label: 'Right Panel Tabs',
    changes: [
      'Added separate Layers, Properties and Adjustments tabs.',
      'Moved Text Styles below Background and kept Templates visible at the bottom.',
      'Stopped selection changes from shifting the Layers area.',
      'Added independent tab scrolling and remembered the active panel.',
    ],
  },
  {
    version: '1.0.33',
    label: 'Default Toolbar Icons',
    changes: [
      'Redesigned the Default theme icons for Cutout Brush, Brush Studio, Eraser and Paint Bucket.',
      'Improved recognition of the four editing tools at toolbar size.',
    ],
  },
];
