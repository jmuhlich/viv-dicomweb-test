import { loadOmeTiff, MultiscaleImageLayer } from '@hms-dbmi/viv';
import { Deck, OrthographicView } from '@deck.gl/core';

console.log("begin");

const {sources, metadata} = await loadOmeTiff("https://lin-2021-crc-atlas.s3.amazonaws.com/data/CRC02.ome.tif");
//console.log(metadata);

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
