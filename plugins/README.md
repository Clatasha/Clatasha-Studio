# Clatasha Studio Plugin API v1

Clatasha Studio accepts local `.clatasha-plugin` packages. Each installed tool runs in a restricted sandbox and receives only the Plugin API permissions declared in its manifest. Plugin code cannot directly access the editor, Fabric.js, extension APIs, or the network.

## Install a plugin

1. Open **Plugins > Install Plugin...**.
2. Choose a file ending in `.clatasha-plugin`.
3. Review the plugin identity, package size, and requested permissions.
4. Choose **Install Plugin**.
5. Open the tool from the Plugins menu.

Installed packages are stored locally by Clatasha Studio. They can be enabled, disabled, removed, updated by installing a newer package with the same ID, or reinstalled later from the original file.

## Package layout

Put these files at the root of a ZIP archive and rename the archive from `.zip` to `.clatasha-plugin`:

```text
plugin.json
plugin.js
plugin.html
plugin.css
icon.svg
assets/optional-image.png
```

The installer accepts JSON, JavaScript, HTML, CSS, SVG, common raster images, local fonts, and text files. Plugin API v1 permits one JavaScript entry file and does not permit imports, remote URLs, or network APIs.

## Manifest

```json
{
  "id": "company.plugin-name",
  "name": "Plugin Name",
  "version": "1.0.0",
  "developer": "Company",
  "description": "What the plugin does.",
  "apiVersion": 1,
  "type": "tool",
  "runtime": "sandbox",
  "entry": "plugin.js",
  "ui": {
    "html": "plugin.html",
    "css": "plugin.css"
  },
  "menuLabel": "Plugin Name",
  "icon": "icon.svg",
  "permissions": [
    "files.localImages",
    "canvas.readDocument",
    "canvas.readSelection",
    "canvas.addImage",
    "plugin.storage"
  ]
}
```

Plugin IDs use lowercase reverse-domain style naming. Versions use `major.minor.patch` format. Request only the permissions the tool actually needs.

## Entry file and lifecycle

The entry file registers one plugin object:

```js
ClatashaPlugin.register({
  async mount({ root, api, manifest, theme }) {
    // Find elements inside root and connect the interface.
  },

  setTheme(theme) {
    // Optional: react to "default" or "bowetech".
  },

  destroy() {
    // Remove listeners, stop work, and release object URLs.
  },
});
```

`plugin.html` is placed inside `root`. `plugin.css` is applied only inside the sandbox document. Do not include script tags or inline event handlers in the HTML.

## Plugin API v1

Calls that cross the sandbox boundary are asynchronous:

```js
api.version
api.plugin                         // id, name, version
api.theme.get()                    // "default" or "bowetech"
api.files.acceptsImage(file)
api.assets.getUrl(path)
await api.canvas.getDocumentSize()
await api.canvas.getSelectedImage()
await api.canvas.addImageBlob(blob, { name })
await api.storage.get(key, fallbackValue)
await api.storage.set(key, value)
await api.storage.remove(key)
await api.ui.notify(message)
await api.ui.close()
```

Every protected API method checks its matching manifest permission. Adding an image creates one normal Clatasha history entry.

## Permissions

| Permission | Allows |
|---|---|
| `files.localImages` | Validate image files selected by the user inside the plugin |
| `canvas.readDocument` | Read the current canvas width and height |
| `canvas.readSelection` | Receive a copy of the selected image layer |
| `canvas.addImage` | Add a generated image as a new canvas layer |
| `plugin.storage` | Store settings in the plugin's private local namespace |

## Local assets

Reference packaged images or fonts in HTML and CSS with `clatasha-asset://`:

```html
<img src="clatasha-asset://assets/example.png" alt="">
```

```css
@font-face {
  font-family: "Plugin Font";
  src: url("clatasha-asset://assets/plugin-font.woff2");
}
```

JavaScript can also request a temporary local URL with `api.assets.getUrl('assets/example.png')`.

## Limits and safety

- Maximum package size: 15 MB
- Maximum unpacked size: 30 MB
- Maximum file count: 100
- Maximum individual file size: 10 MB
- Maximum JavaScript, HTML, or CSS file size: 2 MB
- No encrypted, multi-volume, or ZIP64 archives
- No external URLs, network APIs, imported JavaScript, script tags, or inline HTML event handlers
- No direct editor DOM, Fabric.js, Chrome extension API, or project database access

The `.clatasha-plugin` extension identifies the package format; it is still a ZIP archive internally. Use the included Starter Card package as the smallest working example.
