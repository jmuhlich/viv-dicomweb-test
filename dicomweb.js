import { MultiscaleImageLayer } from '@vivjs/layers';
import { Deck, OrthographicView } from '@deck.gl/core';

import * as DICOMMicroscopyViewer from 'dicom-microscopy-viewer';
import * as DICOMwebClient from 'dicomweb-client';

const client = new DICOMwebClient.api.DICOMwebClient({
  url: 'https://proxy.imaging.datacommons.cancer.gov/current/viewer-only-no-downloads-see-tinyurl-dot-com-slash-3j3d9jyp/dicomWeb',
  verbose: false,
});
const studyInstanceUID = '2.25.93749216439228361118017742627453453196';
const seriesInstanceUID = '1.3.6.1.4.1.5962.99.1.2344794501.795090168.1655907236229.4.0';
const { data, metadata } = await DICOMMicroscopyViewer.viv.loadDicomWeb({ client, studyInstanceUID, seriesInstanceUID });

// Everything below here is identical between the ometiff and dicomweb versions.
// ========================================

const layer = new MultiscaleImageLayer({
  loader: data,
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
