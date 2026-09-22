# Selected Development Changelog

This page records selected Clatasha Studio milestones. It is not a complete internal commit history.

## v1.0.61

- Added editable user templates stored locally with lightweight canvas previews
- Added three-column template browsing with YouTube, Shorts, and custom-size sections
- Added All, My Templates, YouTube, and Shorts filters
- Added three starter 1080 × 1920 Shorts templates
- Added template updating, renaming, duplication, export, and complete deletion

## v1.0.60

- Added a higher-accuracy offline Image to SVG engine
- Added automatic tracing selection for different artwork types
- Added Logo, Illustration, and Photo presets
- Added accuracy and file-size controls with up to 256 colors and 2048-pixel tracing detail
- Moved conversion processing to a background worker with cancellation
- Added synchronized zoom and drag panning for source and SVG comparisons
- Kept conversion local with no external processing API

## v1.0.59

- Improved SVG curves, edge cleanup, region merging, and color handling
- Increased available color and tracing-detail settings
- Reduced visible seams between neighboring vector regions

## v1.0.58

- Added the first offline Image to SVG plugin
- Added editable vector-path output instead of embedding the source bitmap

## v1.0.57

- Improved canvas drag-and-drop reliability
- Prevented dropped image files from unexpectedly opening in a browser tab

## v1.0.55

- Added eight visual adjustment presets
- Added preset hover previews and editable custom adjustments
- Reorganized the Adjustments panel into preset and custom sections

## v1.0.54

- Added Fit to Canvas to the image context menu
- Added left and right 90-degree image rotation

## v1.0.53

- Made transform controls accessible beyond the canvas boundary
- Improved control visibility on light and dark artwork
- Added workspace edge panning during transforms

## v1.0.52

- Added vertical text, zoom, slice, triangle, and polygon tools
- Reorganized related tools into compact toolbar menus

## Earlier development

Earlier builds established the layered editor, text system, brushes, masks, perspective correction, plugin framework, themes, export controls, guides, and other core editing tools.
