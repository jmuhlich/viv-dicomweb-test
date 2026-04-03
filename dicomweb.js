import { MultiscaleImageLayer } from '@hms-dbmi/viv';
import { Deck, OrthographicView } from '@deck.gl/core';

import * as DICOMMicroscopyViewer from 'dicom-microscopy-viewer';
import * as DICOMwebClient from 'dicomweb-client';

// Construct client instance
const client = new DICOMwebClient.api.DICOMwebClient({
    url: 'https://us-central1-idc-external-031.cloudfunctions.net/minerva_proxy'
});

// Retrieve metadata of a series of DICOM VL Whole Slide Microscopy Image instances
const retrieveOptions = {
    studyInstanceUID: '2.25.112849421593762410108114587383519700602',
    seriesInstanceUID: '1.3.6.1.4.1.5962.99.1.331207435.2054329796.1752677896971.4.0'
};
client.retrieveSeriesMetadata(retrieveOptions).then((metadata) => {
  // Parse, format, and filter metadata
  const volumeImages = [];
  metadata.forEach(m => {
    const image = new DICOMMicroscopyViewer.metadata.VLWholeSlideMicroscopyImage({
      metadata: m
    });
    const imageFlavor = image.ImageType[2];
    if (imageFlavor === 'VOLUME' || imageFlavor === 'THUMBNAIL') {
      volumeImages.push(image);
    }
  });

  // Construct viewer instance
  const viewer = new DICOMMicroscopyViewer.viewer.VolumeImageViewer({
    client,
    metadata: volumeImages
  });

  // Render viewer instance in the "viewport" HTML element
  viewer.render({ container: 'viewport' });

  window.viewer = viewer;
  window.client = client;
  window.images = volumeImages;
});

client.retrieveInstanceFrames({
  studyInstanceUID: '2.25.112849421593762410108114587383519700602',
  seriesInstanceUID: '1.3.6.1.4.1.5962.99.1.331207435.2054329796.1752677896971.4.0',
  sopInstanceUID: '1.3.6.1.4.1.5962.99.1.331207435.2054329796.1752677896971.635.0',
  frameNumbers: '1',
})

class DicomPixelSource {
  constructor(
    indexer,
    dtype,
    tileSize,
    shape,
    labels,
    meta
  ) {
    this._indexer = indexer;
    this.dtype = dtype;
    this.tileSize = tileSize;
    this.tileCache = {};
    this.shape = shape;
    this.labels = labels; //?
    this.meta = meta; //?
  }

  async getRaster({ selection, signal }) {
    const image = await this._indexer(selection);
    return await this.getTile(
      { x: 0, y: 0, selection, signal }
    );
  }

  async getTile({ x, y, selection, signal }) {
    const { height, width } = this._getTileExtent(x, y);

    const image = await this._indexer(selection);
    return this._readRasters(
      image, { x, y, width, height, signal }
    );
  }

  async _readRasters(image, props = {}) {
    const index = [ image.c, props.x, props.y ].join('-');
    const frame_path = image.getPyramid().frameMappings[
      [props.y+1, props.x+1, image.c].join('-')
    ];
    if (!frame_path) {
        throw "__emptyFramePath";
    }
    const frame = (
      frame_path.split("/").pop()
    );
    let raster = this.tileCache[index];
    if (!raster) {
      raster = await image.readRasters({
        ...props
      });
      this.tileCache[index] = raster;
    }

    if (props.signal?.aborted) {
      throw "__vivSignalAborted";
    }

    const { data, width, height } = raster;
    return {
      data, width, height
    };
  }

  _getTileExtent(x, y) {
    const [
      zoomLevelHeight, zoomLevelWidth
    ] = this.shape.slice(-2);
    let height = this.tileSize;
    let width = this.tileSize;
    const maxXTileCoord = Math.floor(zoomLevelWidth / this.tileSize);
    const maxYTileCoord = Math.floor(zoomLevelHeight / this.tileSize);

    if (x === maxXTileCoord) {
      width = zoomLevelWidth % this.tileSize;
    }
    if (y === maxYTileCoord) {
      height = zoomLevelHeight % this.tileSize;
    }
    return { height, width };
  }

  onTileError(err) {
    console.error(err);
  }
}


console.log("begin");

// const data = levels.map(level => {
//   new DicomPixelSource(
//     sel => pyramidIndexer(
//       sel, level
//     ),
//     metadata.Pixels.Type,
//     tileSize,
//     getShapeForBinaryDownsampleLevel({
//       axes, level
//     }),
//     axes.labels,
//     meta,
//   );
// });


// const layer = new MultiscaleImageLayer({
//   loader: data,
//   selections: [
//     {c: 8, t: 0, z: 0},
//     {c: 9, t: 0, z: 0},
//     {c: 10, t: 0, z: 0},
//     {c: 11, t: 0, z: 0}
//   ],
//   channelsVisible: [true, true, true, true],
//   contrastLimits: [
//     [4000, 40000],
//     [3000, 30000],
//     [3000, 20000],
//     [5000, 50000],
//   ],
//   colors: [
//     [0, 0, 255],
//     [0, 255, 0],
//     [255, 255, 255],
//     [255, 0, 0]
//   ]
// });

// new Deck({
//   views: new OrthographicView(),
//   initialViewState: {
//     target: [21000, 13000, 0],
//     zoom: -6
//   },
//   controller: true,
//   layers: [layer]
// });

console.log("running");
