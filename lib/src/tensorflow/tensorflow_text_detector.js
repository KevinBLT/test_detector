const DET_MEAN = 0.785;
const DET_STD  = 0.275;
const VOCAB    = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!\"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~°£€¥¢฿àâéèêëîïôùûüçÀÂÉÈÊËÎÏÔÙÛÜÇ';

const detection_size = {
  height  : 512,
  width   : 512,
  toValue : function() { return [this.height, this.width]; }
}

const recognition_size = {
  height  : 32,
  width   : 128,
  toValue : function() { return [this.height, this.width]; }
}


class _TextDetector {
  
  static _detectionModel; 
  static _recognitionModel; 

  _subdivTensor(tensor) {
    return tensor.sub(
      tf.scalar(255 * DET_MEAN)
    ).div(
      tf.scalar(255 * DET_STD)
    );
  }

  _detectionTensor(imageData) {
    let tensor = tf.browser.fromPixels(imageData).resizeNearestNeighbor(
      detection_size.toValue()
    ).toFloat();

    return this._subdivTensor(tensor).expandDims();
  }

  _recognitionTensor(imageData) {
    let h    = imageData.height, 
        w    = imageData.width,
        size = recognition_size.toValue(),
        ar   = size[1] / size[0],
        resize_target,
        padding_target;
              
      if (ar * h > w) {
        resize_target  = [size[0], Math.round((size[0] * w) / h)];
        padding_target = [[0, 0], [0, size[1] - Math.round((size[0] * w) / h)], [0, 0]];
      } else {
        resize_target  = [Math.round((size[1] * h) / w), size[1]];
        padding_target = [[0, size[0] - Math.round((size[1] * h) / w)], [0, 0], [0, 0]];
      }

      return tf.browser.fromPixels(imageData).resizeNearestNeighbor(resize_target)
                       .pad(padding_target, 0).toFloat().expandDims();
  }

  async _wordHeatMap(imageData) {
    let tensor     = this._detectionTensor(imageData),
        heatmap    = null,
        prediction = _TextDetector._detectionModel.execute(tensor);
   
    prediction = tf.squeeze(prediction, 0);

    if (Array.isArray(prediction)) {
      prediction = prediction[0];
    }
    
    heatmap = await tf.browser.toPixels(prediction);

    tensor.dispose();

    return new ImageData(heatmap, imageData.width, imageData.height);
  }
   
  _clamp(number, size) {
    return Math.max(0, Math.min(number, size));
  }

  _transformBoundingBox(contour) {
    const size   = detection_size.toValue(),
          offset = (contour.width * contour.height * 1.8) / (2 * (contour.width + contour.height)),
          p1     = this._clamp(contour.x - offset, size[1]) - 1,
          p2     = this._clamp(p1 + contour.width + 2 * offset, size[1]) - 1,
          p3     = this._clamp(contour.y - offset, size[0]) - 1,
          p4     = this._clamp(p3 + contour.height + 2 * offset, size[0]) - 1;
    
    return {
      coordinates: [
        {x: p1 / size[1], y: p3 / size[0]},
        {x: p2 / size[1], y: p3 / size[0]},
        {x: p2 / size[1], y: p4 / size[0]},
        {x: p1 / size[1], y: p4 / size[0]},
      ]
    };

  };

  async _calculateBoundingBoxses(imageData) {
    let heatmap = await this._wordHeatMap(imageData), 
        src     = cv.matFromImageData(heatmap);

    cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
    cv.threshold(src, src, 77, 255, cv.THRESH_BINARY);
    cv.morphologyEx(src, src, cv.MORPH_OPEN, cv.Mat.ones(2, 2, cv.CV_8U));

    const contours      = new cv.MatVector(),
          hierarchy     = new cv.Mat(),
          boundingBoxes = [];

    cv.findContours(src, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); ++i) {

      const bbox = cv.boundingRect(contours.get(i));

      if (bbox.width > 2 && bbox.height > 2) {
        boundingBoxes.unshift(this._transformBoundingBox(bbox));
      }

    }

    src.delete();
    contours.delete();
    hierarchy.delete();

    for (let i = 0, coords, w, h; i < boundingBoxes.length; i++) {
      coords = boundingBoxes[i].coordinates;
      w      = imageData.width;
      h      = imageData.height;

      boundingBoxes[i] = new TextDecodeResult([
        {x: Math.floor(w * coords[0].x), y: Math.floor(h * coords[0].y)},
        {x: Math.floor(w * coords[1].x), y: Math.floor(h * coords[1].y)},
        {x: Math.floor(w * coords[2].x), y: Math.floor(h * coords[2].y)},
        {x: Math.floor(w * coords[3].x), y: Math.floor(h * coords[3].y)}
      ]);

    }

    return boundingBoxes;
  }

  async detect(imageData) {

    return new Promise(async (resolve) => {
      let boundingBoxes = await this._calculateBoundingBoxses(imageData),
          crops         = [];

      if (boundingBoxes.length == 0) {
        return resolve([]);
      }

      for (let bbox of boundingBoxes) {
        let {x, y, width, height} = bbox.boundingBox,
            data                  = imageData.data,
            crop                  = new Uint8ClampedArray(width * height * 4),
            i0                    = (x + y * imageData.width) * 4;

        for (let i = 0, offset; i < height; i++) {
          offset = i0 + i * imageData.width * 4;

          crop.set(
            imageData.data.subarray(offset, offset + width * 4),
            i * width * 4
          );
        }
 
        crops.push(new ImageData(crop, width, height));
      }

      let tensor      = this._subdivTensor(tf.concat(crops.map(this._recognitionTensor))),
          predictions = await _TextDetector._recognitionModel.executeAsync(tensor),
          bestPath    = tf.unstack(tf.argMax(tf.softmax(predictions, -1), -1), 0),
          words       = [];

      for (const sequence of bestPath) {
        let word  = '', 
            added = false,
            chars = Array.from(sequence.dataSync());

        for (const c of chars) {

          if (c === 126) {
            added = false;
          } else if (!added) {
            word  += VOCAB[c];
            added  = true;
          }
          
        }

        words.push(word);
      }
      
      for (let i = 0; i < boundingBoxes.length; i++) {
        boundingBoxes[i].rawValue = words[i];
      }

      tensor.dispose();

      return resolve(boundingBoxes);
    });

  }
  
  static async initilize() {

    let models = await Promise.all([
      tf.loadGraphModel('tensorflow/db_mobilenet_v2/model.json'),
      tf.loadGraphModel('tensorflow/crnn_mobilenet_v2/model.json')
    ]);

    _TextDetector._detectionModel   = models[0];
    _TextDetector._recognitionModel = models[1];
  }

}