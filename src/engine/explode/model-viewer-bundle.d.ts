// model-viewer's self-contained build (it carries its own three), which registers <model-viewer> when
// imported. Its package's peer `three` range lags this app's, so the unbundled entry is not used.
declare module "@google/model-viewer/dist/model-viewer.min.js";
