class TextDecodeResult {
  boundingBox;
  cornerPoints;
  rawValue;

  constructor(cornerPoints, rawValue = '') {
    this.cornerPoints = cornerPoints;
    this.rawValue     = rawValue; 
    this.setCornerPoints(cornerPoints);
  }

  update() {
    let p = this.cornerPoints;

    this.angle = Math.atan2(
      p[1].y - p[0].y, 
      p[1].x - p[0].x
    );
  }

  setCornerPoints(cornerPoints) {
    let cps  = cornerPoints,
        minX = Math.min(cps[0].x, cps[1].x, cps[2].x, cps[3].x),
        minY = Math.min(cps[0].y, cps[1].y, cps[2].y, cps[3].y),
        maxX = Math.max(cps[0].x, cps[1].x, cps[2].x, cps[3].x),
        maxY = Math.max(cps[0].y, cps[1].y, cps[2].y, cps[3].y);

    this.cornerPoints = cornerPoints;
    this.boundingBox  = DOMRectReadOnly.fromRect({
      x      : minX,
      y      : minY,
      width  : maxX - minX,
      height : maxY - minY
    });
  }

}