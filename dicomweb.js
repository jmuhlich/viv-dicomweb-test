import { MultiscaleImageLayer } from '@hms-dbmi/viv';
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
  }

  async _getViewer() {
    if (this._viewer === undefined) {
      const metadata = await client.retrieveSeriesMetadata(this._retrieveOptions);
      // Parse, format, and filter metadata
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
    if (this._opticalPaths === undefined) {
      const viewer = await this._getViewer();
      const sym_opticalPaths = Object.getOwnPropertySymbols(viewer).find(s =>
        s.description === "opticalPaths"
      );
      this._opticalPaths = viewer[sym_opticalPaths];
    }
    return this._opticalPaths;
  }

  async _getTileSize() {
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
    if (this._loaders === undefined) {
      // We pass viewer.render a detached element as the container just to satisfy the call. We
      // really only need to call render to implicitly create the tile loaders.
      (await this._getViewer()).render({container: document.createElement('div')});
      // It seems like the event loop needs to fire in order to actually populate the loaders. I
      // figured this out empirically -- there may be a more sound approach. Maybe just yielding
      // with a trivially resolved promise would work too?
      await new Promise(resolve => requestAnimationFrame(resolve));
      const opticalPaths = await this._getOpticalPaths();
      this._loaders = Object.fromEntries(
        Object.entries(opticalPaths).map(([c, p]) => [c, p.layer.getSource().loader_])
      );
    }
    return this._loaders[channel];
  }

  async _getShapes() {
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

  async getTile({ level, channel, x, y }) {
    const loader = await this._getLoader(channel);
    const floatTile = await loader(level, x, y);
    const data = new Uint16Array(floatTile);
    // deckgl renders out-of-bounds data in the edge tiles so we need to zero that ourselves.  Maybe
    // we can crop the actual array and return smaller width/height values instead, if deckgl is
    // expecting that.
    const shape = (await this._getShapes())[level];
    const ts = await this._getTileSize();
    const cropX = Math.min(shape[2] - x * ts, ts);
    const cropY = shape[1] - y * ts;
    for (y = 0; y < ts; y++) {
      for (x = cropX; x < ts; x++) {
        data[y * ts + x] = 0;
      }
    }
    for (y = cropY; y < ts; y++) {
      for (x = 0; x < cropX; x++) {
        data[y * ts + x] = 0;
      }
    }
    return { data, width: ts, height: ts };
  }

  async getSources() {
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
    return await this._loader.getTile({ level, channel, x, y});
  }

  onTileError(err) {
    console.error(err);
  }
}


console.log("begin");

const client = new DICOMwebClient.api.DICOMwebClient({
  url: 'https://proxy.imaging.datacommons.cancer.gov/current/viewer-only-no-downloads-see-tinyurl-dot-com-slash-3j3d9jyp/dicomWeb'
});
const retrieveOptions = {
  studyInstanceUID: '2.25.93749216439228361118017742627453453196',
  seriesInstanceUID: '1.3.6.1.4.1.5962.99.1.2344794501.795090168.1655907236229.4.0'
};
const loader = new DicomLoader(client, retrieveOptions);
const sources = await loader.getSources();

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

console.log("running");
