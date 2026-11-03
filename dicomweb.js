import { MultiscaleImageLayer } from '@vivjs/layers';
import { SIGNAL_ABORTED } from '@vivjs/loaders';
import { Deck, OrthographicView } from '@deck.gl/core';

import * as DICOMMicroscopyViewer from 'dicom-microscopy-viewer';
import * as DICOMwebClient from 'dicomweb-client';

class DicomLoader {
  constructor(
    client,
    retrieveOptions,
  ) {
    this._client = client;
    this._retrieveOptions = retrieveOptions;
    this._currentSignal = undefined;
    this._abortedRequests = new WeakSet();
  }

  async _getViewer() {
    if (this._viewer === undefined) {
      // This method comes almost verbatim from the dicom-microscopy-viewer README.
      const metadata = await client.retrieveSeriesMetadata(this._retrieveOptions);
      const volumeImages = [];
      metadata.forEach(m => {
        const image = new DICOMMicroscopyViewer.metadata.VLWholeSlideMicroscopyImage({
          metadata: m
        });
        if (image.BitsAllocated != 16) {
          throw new Error("Only 16-bit images are supported");
        }
        const imageFlavor = image.ImageType[2];
        if (imageFlavor === 'VOLUME' || imageFlavor === 'THUMBNAIL') {
          volumeImages.push(image);
        }
      });
      this._viewer = new DICOMMicroscopyViewer.viewer.VolumeImageViewer({
        client,
        metadata: volumeImages
      });
    }
    return this._viewer;
  }

  async _getOpticalPaths() {
    // Return the opticalPaths structure from the Viewer.
    if (this._opticalPaths === undefined) {
      const viewer = await this._getViewer();
      this._opticalPaths = viewer.opticalPaths; // FUTURE: opticalPaths is currently private.
    }
    return this._opticalPaths;
  }

  async _getTileSize() {
    // Return the tile size (one value is both width and height as we assume square tiles).
    if (this._tileSize === undefined) {
      const opticalPaths = await this._getOpticalPaths();
      const tileSizes = Object.entries(opticalPaths).map(([c, p]) => p.pyramid.tileSizes).flat(2);
      if (tileSizes.some(s => s != tileSizes[0])) {
        throw new Error("Inconsistent or non-square tile sizes are not supported");
      }
      this._tileSize = tileSizes[0];
    }
    return this._tileSize;
  }

  async _getLoader(channel) {
    // Return the per-channel loader function from the Viewer.
    if (this._loaders === undefined) {
      const viewer = await this._getViewer();
      const opticalPaths = await this._getOpticalPaths();
      this._loaders = Object.fromEntries(
        Object.entries(opticalPaths).map(([c, p]) => [c, viewer.getLoader(p)]) // FUTURE: viewer doesn't currently expose loaders.
      );
    }
    return this._loaders[channel];
  }

  async _getShapes() {
    // Return an array of [c,y,x] arrays, each describing the dimensions of a pyramid level.
    if (this._shapes === undefined) {
      const opticalPaths = await this._getOpticalPaths();
      const sizeC = Object.keys(opticalPaths).length;
      this._shapes = opticalPaths[0].pyramid.metadata.map(m => {
        const sizeY = m.TotalPixelMatrixRows;
        const sizeX = m.TotalPixelMatrixColumns;
        return [sizeC, sizeY, sizeX];
      });
    }
    return this._shapes;
  }

  async getTile({ level, channel, x, y, signal }) {
    // Return a Viv PixelData object for the given coordinates.
    const loader = await this._getLoader(channel);
    let floatTile;
    try {
      floatTile = await loader(level, x, y, signal=signal); // FUTURE: loader functions don't currently accept an AbortSignal.
    } catch (e) {
      // If the error was triggered by one of our deliberate abort calls, ignore it and rethrow the
      // special error string that signals this situation to Viv. Rethrow any other errors.
      if (/* is deliberately aborted request */) { // FUTURE: loader AbortSignal rejection will need to document the Error thrown.
        throw SIGNAL_ABORTED;
      } else {
        console.log("getTile: unexpected error: ", e.message);
        throw e;
      }
    }
    const data = new Uint16Array(floatTile);
    /* omitted code to zero out-of-bounds pizels */
    return { data, width: ts, height: ts };
  }

  async getSources() {
    // Return an array of Viv PixelSource objects for each pyramid level, largest to smallest.
    const levelShapes = await this._getShapes();
    const tileSize = await this._getTileSize();
    const sources = levelShapes.map(
      (shape, i) => new DicomPixelSource(this, i, shape, 'Uint16', tileSize)
    );
    // d-m-v pyramids go small-to-large but viv expects large-to-small.
    sources.reverse();
    return sources;
  }

}


class DicomPixelSource {
  // This is our implementation of the Viv PixelSource interface. Viv's interface works in terms of
  // pyramid levels at the outer layer, but dicom-microscopy-viewer puts optical paths (channels) at
  // the outer layer and nests pyramids underneath them. Thus this class is really just a very thin
  // adaptor layer over DicomLoader.getTile to manage that difference.
  constructor(
    loader,
    level,
    shape,
    dtype,
    tileSize,
  ) {
    this._loader = loader;
    this._level = level;
    this.labels = ["c", "y", "x"];
    this.shape = shape,
    this.dtype = dtype;
    this.tileSize = tileSize;
    this.meta = null;
  }

  async getRaster({ selection, signal }) {
    if (this.shape[1] > this.tileSize || this.shape[2] > this.tileSize) {
      throw new Error("getRaster not supported for multi-tile pyramid levels");
    }
    return await this.getTile({ x: 0, y: 0, selection, signal });
  }

  async getTile({ x, y, selection, signal }) {
    const level = this._level;
    const channel = selection.c;
    return await this._loader.getTile({ level, channel, x, y, signal });
  }

  onTileError(err) {
    console.error(`Tile error: ${err}`);
  }
}


// Above is all the library code. Here's the setup code to use it.
// ========================================

const client = new DICOMwebClient.api.DICOMwebClient({
  url: 'https://proxy.imaging.datacommons.cancer.gov/current/viewer-only-no-downloads-see-tinyurl-dot-com-slash-3j3d9jyp/dicomWeb',
  verbose: false,
});
const retrieveOptions = {
  studyInstanceUID: '2.25.93749216439228361118017742627453453196',
  seriesInstanceUID: '1.3.6.1.4.1.5962.99.1.2344794501.795090168.1655907236229.4.0'
};
const loader = new DicomLoader(client, retrieveOptions);
const sources = await loader.getSources();

// Everything below here is identical between the ometiff and dicomweb versions.
// ========================================

const layer = new MultiscaleImageLayer({
  loader: sources,
  selections: [
    {c: 8, t: 0, z: 0},
    {c: 9, t: 0, z: 0},
    {c: 10, t: 0, z: 0},
    {c: 11, t: 0, z: 0}
  ],
  channelsVisible: [true, true, true, true],
  contrastLimits: [
    [4000, 40000],
    [3000, 30000],
    [3000, 20000],
    [5000, 50000],
  ],
  colors: [
    [0, 0, 255],
    [0, 255, 0],
    [255, 255, 255],
    [255, 0, 0]
  ]
});

new Deck({
  views: new OrthographicView(),
  initialViewState: {
    target: [21000, 13000, 0],
    zoom: -6
  },
  controller: true,
  layers: [layer]
});
