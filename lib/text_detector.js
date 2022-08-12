class _TextDetector {
  static pending = new Map();
  static worker;
  static libPath;
  static ready;

  minSize = 512;
  maxSize = 2048;

  constructor() {
    _TextDetector.initilize();
  }

  static async initilize() {
    if (_TextDetector.ready) return _TextDetector.ready;

    let jsName = 'text_detector.js';

    _TextDetector.libPath = document.querySelector('[src$="' + jsName + '"]').src.replace('' + jsName + '','');
    _TextDetector.worker  = new Worker(_TextDetector.libPath + 'src/text_detector.worker.js');
    _TextDetector.ready   = new Promise(
      (resolve) => _TextDetector.worker.addEventListener('message', resolve, {once: true})
    );

    await _TextDetector.ready;

    _TextDetector.worker.addEventListener('message', (messageEvent) => {
      let id     = messageEvent.data.id,
          time   = new Date(),
          data   = messageEvent.data,
          result = data.result;
  
      if (_TextDetector.pending.has(id)) {
        result._decodeDuration = time - data.time;
        result._decoder        = data.decoder;
        result.textLines       = data.textLines,
        result.fullText        = data.fullText;
  
        _TextDetector.pending.get(id).resolve(result);
  
        _TextDetector.pending.delete(id);
      }
    });

    return _TextDetector.ready;
  }
  
  async detect(image) {
    await _TextDetector.initilize();

    let id = _TextDetector._id, time = _TextDetector._time;
    
    return new Promise((resolve, reject) => {
      let canvas = document.createElement('canvas'),
          ctx    = canvas.getContext('2d'),
          size   = this._imageSize(image),
          width  = size.width,
          height = size.height,
          buffer = new ArrayBuffer(64);

      if (image instanceof ImageData) {
        buffer = image.data.buffer;
        size   = {width: image.width, height: image.height, scaleX: 1, scaleY: 1};
      } else if (width > 0 && height > 0) {
        canvas.width  = width;
        canvas.height = height;

        ctx.drawImage(image, 0, 0, width, height);

        buffer = ctx.getImageData(0, 0, width, height).data.buffer;
      }

      _TextDetector.pending.set(id, { resolve, reject, size });

      _TextDetector.worker.postMessage({ buffer, id, time, size, method: 'detect' }, buffer);
    });

  }
  
  _imageSize(img) {
    let w   = img.videoWidth  || img.naturalWidth  || img.width  || 0,
        h   = img.videoHeight || img.naturalHeight || img.height || 0,
        nw  = w, 
        nh  = h;
    
    if (h > 0 && w > 0) {
      if (w > h) {
        nw = Math.max(this.minSize, Math.min(this.maxSize, w));
        nh = Math.max(this.minSize, Math.min(this.maxSize, nw * (h / w)));
      } else {
        nh = Math.max(this.minSize, Math.min(this.maxSize, h));
        nw = Math.max(this.minSize, Math.min(this.maxSize, nh * (w / h)));
      }  
    }

    return { 
      width: Math.ceil(nw), height: Math.ceil(nh), 
      scaleX: nw / w,       scaleY: nh / h 
    };

  }

  static get _id()   { return Math.round(Math.random() * 10000000); }
  static get _time() { return (new Date()).valueOf(); }
}

window.TextDetector = _TextDetector;
