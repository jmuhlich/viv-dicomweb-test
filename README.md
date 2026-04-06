# Viv DICOMweb test
A demo [Viv](https://github.com/hms-dbmi/viv/) image loader for
[DICOMweb](https://www.dicomstandard.org/using/dicomweb) image repostories.

All the heavy lifting is done by
[dicom-microscopy-viewer](https://imagingdatacommons.github.io/dicom-microscopy-viewer/)
although some private attribute access was required. This is just a proof of
concept for now.

## Live demos

### Viv with DICOMweb loader
https://jmuhlich.github.io/viv-dicomweb-test/dicomweb.html

The demo image is a colorectal cancer specimen imaged by cyclic
immunofluorescence from
[Lin et. al 2023](https://doi.org/10.1016/j.cell.2022.12.028).
The channels shown here are DNA (blue), Ki67 (green), Keratin (white), and alpha
smooth muscle actin (red). The underlying DICOM store is the
[NCI Imaging Data Commons](https://datacommons.cancer.gov/repository/imaging-data-commons).

### Side-by-side comparison of OME-TIFF and DICOMweb loaders
https://jmuhlich.github.io/viv-dicomweb-test/

This shows separate Viv instances with the same image, one loaded from an
OME-TIFF file and the other from DICOMweb. The OME-TIFF is stored in an AWS S3
bucket and the DICOMweb source is the same one from the above demo. This example
is meant to help evaluate rendering correctness, not compare performance.

## Running locally
```shell
git clone https://github.com/jmuhlich/viv-dicomweb-test.git
cd viv-dicomweb-test
pnpm install
pnpm dev
```
