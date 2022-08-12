## Description

This library adds an abstraction above the original [`TextDetector`](https://web.dev/shape-detection/#textdetector) object that will call it via a web worker internally. If the `TextDetector` is not available
in the browser or the platform, a tensorflow version for OCR is used.

## Example

Include the library `lib/text_detector.js` as a script, so
that it runs before any code using `TextDetector`.

```javascript
let textDetector  = new TextDetector();
let detectedTexts = await textDetector.detect(document.querySelector('img'));

for (let e of detectedTexts) {
  console.log(e.rawValue);
}
```

There are some additions to the original API.

See the following:

```javascript

textDetector.minSize; // The min size used for images, scaled up   if needed
textDetector.maxSize; // The min size used for images, scaled down if exceeded

console.log(e.textLines);        // The text as a list of lines
console.log(e.fullText);         // The full decoded
console.log(e._decodeDuration);  // The duration of the decoding in ms
console.log(e._decoder);         // 'native' | 'tensorflow'

for (let e of detectedTexts) {
  console.log(e.angle); // The angle of the rect
}

```


## Credits

- Inspiration: https://github.com/mindee/doctr-tfjs-demo
- OpenCV: https://opencv.org (js version)
- Tensorflow: https://www.tensorflow.org/js (js version)