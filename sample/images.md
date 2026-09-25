# Images

Local images resolve relative to **this document's folder** and are served
through the Tauri asset protocol, which is scoped to the workspace root.

## Same-folder relative path

The app logo, referenced as `./images/logo.png`:

![md-reader logo](./images/logo.png)

## Without the leading `./`

The same file, written as `images/quick-open.png`:

![Quick open palette](images/quick-open.png)

## A wider diagram

![Architecture overview](./images/architecture.png)

## Focus mode

One band stays legible while the rest dims:

![Focus mode band](./images/focus-mode.png)

## Remote and inline sources are left alone

A remote image is passed through untouched (it will only load when online):

![Remote badge](https://img.shields.io/badge/md--reader-sample-blue)

An inline `data:` URI is also untouched:

![Inline dot](data:image/gif;base64,R0lGODlhCgAKAIAAAC9vuAAAACH5BAAAAAAALAAAAAAKAAoAAAIIhI+py+0PYysAOw==)

## A missing image still renders as a broken image, not a crash

![Deliberately missing](./images/does-not-exist.png)

See also [[notes/architecture]] and [[README]].
